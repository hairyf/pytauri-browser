use tauri::{
    ipc::Invoke,
    Wry
};

pub mod python;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


// configure invoke handler
pub fn handler() -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![greet]
}

// configure tauri builder
pub fn builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default().invoke_handler(handler())
}