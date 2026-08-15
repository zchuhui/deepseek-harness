//! Isolation tests for the tiny_http listener on this host: a listener must
//! survive completed and aborted connections. Regression anchor for the
//! bridge idle-timeout bug (Agent Note 2026-08-15-desktop-bridge-idle-timeout):
//! recv_timeout returns Ok(None) on idle, and the bridge loop must treat it as
//! an idle wait, never as a closed channel.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/** Run one server loop until stop; Ok(None) continues instead of breaking. */
fn serve(port: u16, stop: Arc<AtomicBool>) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let server = tiny_http::Server::http(("127.0.0.1", port)).expect("bind succeeds");
        while !stop.load(Ordering::Relaxed) {
            let request = match server.recv_timeout(Duration::from_millis(200)) {
                Ok(Some(request)) => request,
                Ok(None) => continue,
                Err(_) => continue,
            };
            let _ = request.respond(
                tiny_http::Response::from_string("ok").with_status_code(tiny_http::StatusCode(200)),
            );
        }
    })
}

fn connect(port: u16) -> std::io::Result<TcpStream> {
    TcpStream::connect_timeout(
        &("127.0.0.1", port)
            .to_socket_addrs()
            .unwrap()
            .next()
            .unwrap(),
        Duration::from_secs(2),
    )
}

#[test]
fn listener_survives_completed_requests() {
    let stop = Arc::new(AtomicBool::new(false));
    let handle = serve(3911, Arc::clone(&stop));
    std::thread::sleep(Duration::from_millis(300));
    {
        let mut stream = connect(3911).expect("first connection succeeds");
        stream
            .write_all(b"GET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
            .unwrap();
        let mut buffer = [0u8; 64];
        let _ = stream.read(&mut buffer);
    }
    connect(3911).expect("listener survives a completed request");
    stop.store(true, Ordering::Relaxed);
    let _ = handle.join();
}

#[test]
fn listener_survives_aborted_connections() {
    let stop = Arc::new(AtomicBool::new(false));
    let handle = serve(3912, Arc::clone(&stop));
    std::thread::sleep(Duration::from_millis(300));
    drop(connect(3912).expect("connection succeeds"));
    std::thread::sleep(Duration::from_millis(300));
    connect(3912).expect("listener survives an aborted connection");
    stop.store(true, Ordering::Relaxed);
    let _ = handle.join();
}
