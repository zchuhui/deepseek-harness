# Agent Note:桌面桥接在首个空闲半秒后即死亡

Status: implemented

[English](2026-08-15-desktop-bridge-idle-timeout.md) | 中文

## 问题

桌面壳的桥接监听器在启动后不久就消失:冒烟探针显示进程存活、主窗口正常,但 `127.0.0.1:3901` 拒绝连接。宿主侧桌面 provider(通知、更新、凭据)除非在启动后约 500ms 内发出请求,否则实际上永远无法触达壳。

## 决策

- **根因**:`tiny_http` 的 `Server::recv_timeout` 把内部 `MessagesQueue::pop_timeout` 的空闲超时映射为 `Ok(None)`——那是空闲等待,不是通道关闭。桥循环把 `Ok(None)` 当作通道关闭而 `break`,在首个空闲半秒后丢弃 `Server`、关闭监听器。
- **修复**:`Ok(None)` 现在是空闲等待(`continue`);循环只由停止标志终止。`Err` 分支继续忽略 accept 线程的错误报告——accept 线程死亡后实际已不可达,生命周期由停止标志拥有。
- **回归锚点**:`desktop-app/src-tauri/tests/tiny_http_listener.rs` 在本机锚定该语义——监听器在完成与中断的连接之后仍存活。

## 已考虑的替代方案

- **手写 `std::net` 服务器替换 tiny_http。** 不采用:循环语义修正后该依赖工作正常;隔离测试在壳外复现了健康行为。
- **轮询 `num_connections()` 或其他存活信号。** 不采用:不存在这种信号;停止标志已拥有生命周期。

## 后果

- 本机已验证:修复后桥监听器空闲 8 秒仍存活,对无 token 请求应答 401,请求之后继续监听。
- 里程碑 2 的桥从未服务过晚于首个空闲超时的请求;此前能工作的桌面 provider 消费者都只是落在那个窗口内。

相关:[协议深链、单实例与 toast 激活](../feature/2026-08-15-desktop-protocol-single-instance-toast-activation.md)。
