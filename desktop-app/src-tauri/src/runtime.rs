//! Runtime Manager: resolves a development or bundled dsh executable, starts
//! it on a shell-owned loopback port, and waits for its nonce-authenticated
//! readiness response.

use std::fs::File;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/** Environment override for the dsh launch command (tokens split on whitespace). */
pub const ENV_COMMAND_OVERRIDE: &str = "DSH_DESKTOP_COMMAND";
/** Environment override for the web port; default 3080. */
pub const ENV_PORT: &str = "DSH_DESKTOP_PORT";
/** Default web port. */
pub const DEFAULT_PORT: u16 = 3080;
/** Environment nonce that authenticates the desktop-only readiness route. */
pub const ENV_WEB_TOKEN: &str = "DSH_DESKTOP_WEB_TOKEN";

/** Choose an unused loopback port for one shell boot attempt. */
pub fn allocate_loopback_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("allocate loopback port failed: {error}"))?
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("read allocated loopback port failed: {error}"))
}

/** One resolved launch command: program, argv, and working directory. */
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchSpec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

/**
 * Walk up from start looking for a checkout whose package.json names
 * @deepseek-ai/dsh-root.
 * @param start - directory to walk up from.
 * @returns the checkout root, or None.
 */
pub fn find_checkout_root(start: &Path) -> Option<PathBuf> {
    let mut dir = Some(start.to_path_buf());
    while let Some(current) = dir {
        let pkg = current.join("package.json");
        if let Ok(mut file) = File::open(&pkg) {
            let mut text = String::new();
            if file.read_to_string(&mut text).is_ok() && text.contains("\"@deepseek-ai/dsh-root\"")
            {
                return Some(current);
            }
        }
        dir = current.parent().map(Path::to_path_buf);
    }
    None
}

/**
 * Resolve the launch spec for one port: explicit env override wins, then
 * a checkout root (source launch through tsx), then dsh on PATH. Defaulting
 * is this explicit step, never hidden inside spawn.
 * @param port - web port to pass to dsh.
 * @param start - directory to search for a checkout from.
 * @returns the resolved spec, or an error when nothing can launch dsh.
 */
pub fn resolve_launch_spec(port: u16, start: &Path) -> Result<LaunchSpec, String> {
    if let Ok(override_cmd) = std::env::var(ENV_COMMAND_OVERRIDE) {
        let tokens: Vec<String> = override_cmd.split_whitespace().map(String::from).collect();
        let (program, args) = tokens
            .split_first()
            .ok_or_else(|| "DSH_DESKTOP_COMMAND must not be empty".to_string())?;
        return Ok(LaunchSpec {
            program: program.clone(),
            args: args.to_vec(),
            cwd: start.to_path_buf(),
        });
    }
    if let Some(root) = find_checkout_root(start) {
        return Ok(LaunchSpec {
            program: "node".to_string(),
            args: vec![
                "--import".to_string(),
                "tsx/esm".to_string(),
                "apps/cli/src/bin.ts".to_string(),
                "--profile".to_string(),
                "desktop".to_string(),
                "--port".to_string(),
                port.to_string(),
            ],
            cwd: root,
        });
    }
    // dsh on PATH: the npm shim is dsh.cmd on Windows and must run through cmd.
    let (program, args) = if which("dsh.cmd").is_some() {
        (
            "cmd".to_string(),
            vec![
                "/C".to_string(),
                "dsh.cmd".to_string(),
                "--profile".to_string(),
                "desktop".to_string(),
                "--port".to_string(),
                port.to_string(),
            ],
        )
    } else if which("dsh").is_some() {
        (
            "dsh".to_string(),
            vec!["--profile".to_string(), "desktop".to_string(), "--port".to_string(), port.to_string()],
        )
    } else {
        return Err(
            "dsh not found: run pnpm build in the checkout or npm i -g @deepseek-ai/dsh"
                .to_string(),
        );
    };
    Ok(LaunchSpec {
        program,
        args,
        cwd: start.to_path_buf(),
    })
}

/** Resolve the installed application's bundled Node and dsh CLI. */
pub fn resolve_bundled_launch_spec(port: u16, resource_dir: &Path) -> Result<LaunchSpec, String> {
    let runtime = resource_dir.join("runtime");
    let node = runtime.join("node.exe");
    // pnpm deploy lays the dsh CLI package out at the runtime root.
    let cli = runtime.join("lib").join("bin.js");
    if !node.is_file() || !cli.is_file() {
        return Err("desktop runtime is incomplete; reinstall DeepSeek Harness".to_string());
    }
    Ok(LaunchSpec {
        program: node.to_string_lossy().into_owned(),
        args: vec![
            cli.to_string_lossy().into_owned(),
            "--profile".to_string(),
            "desktop".to_string(),
            "--host".to_string(),
            "127.0.0.1".to_string(),
            "--port".to_string(),
            port.to_string(),
        ],
        cwd: runtime,
    })
}

/** Whether an executable named name is found on PATH. */
fn which(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/** Whether a TCP connection to 127.0.0.1:port is accepted. */
pub fn tcp_connect_ok(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("loopback address parses"),
        Duration::from_millis(1500),
    )
    .is_ok()
}

/**
 * Whether the local service answers an HTTP GET with any HTTP response.
 * Any response line starting with HTTP/ counts: the web server has no
 * dedicated health route and may answer 404 while booting.
 * @param port - web port.
 * @returns true once any HTTP response arrives.
 */
pub fn http_any_response(port: u16) -> bool {
    let mut stream = match TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("loopback address parses"),
        Duration::from_secs(2),
    ) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut buffer = [0u8; 512];
    let mut total = 0usize;
    while total < buffer.len() {
        match stream.read(&mut buffer[total..]) {
            Ok(0) => break,
            Ok(n) => total += n,
            Err(_) => break,
        }
        if total > 0 && String::from_utf8_lossy(&buffer[..total]).contains("HTTP/") {
            return true;
        }
    }
    false
}

/** Verify the desktop runtime's nonce-protected readiness response. */
pub fn http_desktop_ready(port: u16, token: &str) -> bool {
    let mut stream = match TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("loopback address parses"),
        Duration::from_secs(2),
    ) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = format!(
        "GET /internal/desktop/ready HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-DSH-Desktop-Token: {token}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok() && response.starts_with("HTTP/1.1 204")
}

/**
 * The local dsh web runtime. Spawned children are killed (tree) on drop;
 * a reused service is left untouched.
 */
pub struct RuntimeManager {
    pub port: u16,
    pub spec: LaunchSpec,
    child: Option<Child>,
}

impl RuntimeManager {
    /**
     * Build the manager from a resolved spec.
     * @param port - web port.
     * @param spec - resolved launch command.
     */
    pub fn new(port: u16, spec: LaunchSpec) -> Self {
        Self {
            port,
            spec,
            child: None,
        }
    }

    /**
     * Start a fresh service and readiness-poll it.
     * @param extra_env - environment entries added to the spawned child.
     * @returns the spawned outcome, or an error naming the failing step.
     */
    pub fn start(&mut self, extra_env: &[(&str, &str)]) -> Result<(), String> {
        if tcp_connect_ok(self.port) {
            return Err(format!("port {} is already occupied", self.port));
        }
        let mut command = Command::new(&self.spec.program);
        command
            .args(&self.spec.args)
            .current_dir(&self.spec.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        for (key, value) in extra_env {
            command.env(key, value);
        }
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        command.stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|error| format!("启动 dsh 失败: {error}"))?;
        let deadline = Instant::now() + Duration::from_secs(60);
        while Instant::now() < deadline {
            if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
                // The release child runs detached, so an early exit is the only
                // signal a failed boot leaves; surface its stderr instead of a
                // bare exit code the operator cannot act on.
                let mut detail = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    let _ = stderr.read_to_string(&mut detail);
                }
                let detail = detail.trim();
                if detail.is_empty() {
                    return Err(format!("dsh 运行时在就绪前退出(退出码 {status})"));
                }
                return Err(format!("dsh 运行时在就绪前退出(退出码 {status}): {detail}"));
            }
            let ready = extra_env
                .iter()
                .find(|(key, _)| *key == ENV_WEB_TOKEN)
                .map(|(_, token)| http_desktop_ready(self.port, token))
                .unwrap_or_else(|| http_any_response(self.port));
            if ready {
                self.child = Some(child);
                return Ok(());
            }
            std::thread::sleep(Duration::from_secs(1));
        }
        kill_tree(&child);
        Err("dsh 运行时等待就绪超过 60 秒".to_string())
    }
}

impl Drop for RuntimeManager {
    fn drop(&mut self) {
        if let Some(child) = &self.child {
            kill_tree(child);
        }
    }
}

/** Terminate one child process with its descendants. */
fn kill_tree(child: &Child) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &child.id().to_string()])
            .spawn();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("dsh-desktop-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir creates");
        dir
    }

    #[test]
    fn finds_a_checkout_root_by_package_name() {
        let root = temp_dir("checkout");
        std::fs::write(
            root.join("package.json"),
            "{\n  \"name\": \"@deepseek-ai/dsh-root\"\n}\n",
        )
        .unwrap();
        let nested = root.join("a").join("b");
        std::fs::create_dir_all(&nested).unwrap();
        assert_eq!(find_checkout_root(&nested), Some(root.clone()));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn returns_none_without_a_checkout() {
        let dir = temp_dir("no-checkout");
        assert_eq!(find_checkout_root(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn http_probe_accepts_any_http_response() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut request = [0u8; 256];
                let _ = stream.read(&mut request);
                let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\n\r\n");
            }
        });
        assert!(http_any_response(port));
        handle.join().unwrap();
    }

    #[test]
    fn http_probe_rejects_a_non_http_occupant() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut request = [0u8; 256];
                let _ = stream.read(&mut request);
                let _ = stream.write_all(b"garbage-not-http");
            }
        });
        assert!(!http_any_response(port));
        handle.join().unwrap();
    }

    #[test]
    fn readiness_probe_requires_the_nonce_and_status() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut request = [0_u8; 512];
                let size = stream.read(&mut request).unwrap_or(0);
                let request = String::from_utf8_lossy(&request[..size]);
                assert!(request.contains("X-DSH-Desktop-Token: ready-token"));
                let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\n\r\n");
            }
        });
        assert!(http_desktop_ready(port, "ready-token"));
        handle.join().unwrap();
    }

    #[test]
    fn start_fails_when_the_port_is_occupied_without_http() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let spec = LaunchSpec {
            program: "node".into(),
            args: vec!["--version".into()],
            cwd: temp_dir("occupied"),
        };
        let mut manager = RuntimeManager::new(port, spec);
        assert!(manager.start(&[]).is_err());
    }

    #[test]
    fn allocates_a_nonzero_loopback_port() {
        assert_ne!(0, allocate_loopback_port().unwrap());
    }

    #[test]
    fn bundled_spec_refuses_an_incomplete_runtime() {
        let root = temp_dir("bundled-runtime");
        assert!(resolve_bundled_launch_spec(3100, &root).is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
