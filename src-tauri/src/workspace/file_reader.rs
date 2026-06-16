use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub relative_path: String,
    pub content: String,
    pub size: u64,
    pub line_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadError {
    pub path: String,
    pub error: String,
    pub kind: ReadErrorKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReadErrorKind {
    FileNotFound,
    NotAFile,
    BinaryDetected,
    InvalidUtf8,
    PermissionDenied,
    IoError,
}

impl std::fmt::Display for ReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{:?}] {}: {}", self.kind, self.path, self.error)
    }
}

fn contains_binary_bytes(bytes: &[u8]) -> bool {
    let mut null_count = 0;
    let sample_len = bytes.len().min(8192);
    for &b in &bytes[..sample_len] {
        if b == 0 {
            null_count += 1;
            if null_count >= 3 {
                return true;
            }
        }
    }
    false
}

pub async fn read_file_content(
    file_path: &str,
    relative_to: Option<&str>,
) -> Result<FileContent, ReadError> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Err(ReadError {
            path: file_path.to_string(),
            error: "File does not exist".to_string(),
            kind: ReadErrorKind::FileNotFound,
        });
    }

    if path.is_dir() {
        return Err(ReadError {
            path: file_path.to_string(),
            error: "Path is a directory, not a file".to_string(),
            kind: ReadErrorKind::NotAFile,
        });
    }

    let raw_bytes = fs::read(path).await.map_err(|e| {
        let kind = if e.kind() == std::io::ErrorKind::PermissionDenied {
            ReadErrorKind::PermissionDenied
        } else {
            ReadErrorKind::IoError
        };
        ReadError {
            path: file_path.to_string(),
            error: e.to_string(),
            kind,
        }
    })?;

    if contains_binary_bytes(&raw_bytes) {
        return Err(ReadError {
            path: file_path.to_string(),
            error: "Binary content detected — rejected to prevent context pollution".to_string(),
            kind: ReadErrorKind::BinaryDetected,
        });
    }

    let content = String::from_utf8(raw_bytes.clone()).map_err(|_| ReadError {
        path: file_path.to_string(),
        error: "Invalid UTF-8 encoding — file appears to contain non-text data".to_string(),
        kind: ReadErrorKind::InvalidUtf8,
    })?;

    let line_count = content.lines().count();
    let size = raw_bytes.len() as u64;

    let relative_path = match relative_to {
        Some(root) => {
            let full = path.to_string_lossy();
            full.strip_prefix(root)
                .unwrap_or(&full)
                .trim_start_matches(['/', '\\'])
                .to_string()
        }
        None => path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    };

    Ok(FileContent {
        path: file_path.to_string(),
        relative_path,
        content,
        size,
        line_count,
    })
}
