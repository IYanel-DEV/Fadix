mod commands;
mod workspace;
mod llm;

use commands::workspace::{list_workspace, read_workspace_file, write_workspace_file};
use commands::llm::llm_stream_chat;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_workspace,
            read_workspace_file,
            write_workspace_file,
            llm_stream_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
