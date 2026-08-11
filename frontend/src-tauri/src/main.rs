// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMA-BUF renderer is a known crash / black-canvas source on
    // Linux with the proprietary NVIDIA driver (the WebGL orb triggers it).
    // Opt out before the webview exists, but never override a value the user
    // set themselves. Must run here, before any threads spawn — set_var is
    // only sound while the process is single-threaded.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
            && std::path::Path::new("/proc/driver/nvidia").exists()
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    handymate_desktop::run();
}
