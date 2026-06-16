use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteResult {
    pub path: String,
    pub bytes_written: u64,
    pub backup_path: Option<String>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteError {
    pub path: String,
    pub error: String,
    pub backup_preserved: bool,
    pub backup_path: Option<String>,
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Write failed for '{}': {} (backup preserved: {}, backup at: {:?})",
            self.path, self.error, self.backup_preserved, self.backup_path
        )
    }
}

fn generate_tmp_path(original: &Path) -> PathBuf {
    let parent = original.parent().unwrap_or(Path::new("."));
    let stem = original
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = original
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let pid = std::process::id();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let tmp_name = format!("{}.{}.{}.tmp.fadix", stem, pid, timestamp);
    parent.join(tmp_name)
}

fn generate_backup_path(original: &Path) -> PathBuf {
    let parent = original.parent().unwrap_or(Path::new("."));
    let stem = original
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = original
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let backup_name = format!("{}.bak.{}.{}", stem, timestamp, ext);
    parent.join(backup_name)
}

async fn rollback(tmp_path: &Path, backup_path: Option<&Path>) {
    let _ = fs::remove_file(tmp_path).await;
    if let Some(backup) = backup_path {
        if backup.exists() {
            let original = backup.with_extension("");
            let _ = fs::rename(backup, original).await;
        }
    }
}

pub async fn atomic_write(
    file_path: &str,
    content: &str,
    create_backup: bool,
) -> Result<WriteResult, WriteError> {
    let target = PathBuf::from(file_path);
    let tmp_path = generate_tmp_path(&target);

    let has_backup = create_backup && target.exists();
    let backup_path = if has_backup {
        let bp = generate_backup_path(&target);
        fs::copy(&target, &bp)
            .await
            .map_err(|e| WriteError {
                path: file_path.to_string(),
                error: format!("Failed to create backup: {}", e),
                backup_preserved: false,
                backup_path: None,
            })?;
        Some(bp)
    } else {
        None
    };

    match fs::write(&tmp_path, content).await {
        Ok(_) => {}
        Err(e) => {
            rollback(&tmp_path, backup_path.as_deref()).await;
            return Err(WriteError {
                path: file_path.to_string(),
                error: format!("Failed to write temp file: {}", e),
                backup_preserved: has_backup,
                backup_path: backup_path.map(|p| p.to_string_lossy().into_owned()),
            });
        }
    }

    match fs::rename(&tmp_path, &target).await {
        Ok(_) => {
            if let Some(ref bp) = backup_path {
                let _ = fs::remove_file(bp).await;
            }
            let bytes_written = content.len() as u64;
            Ok(WriteResult {
                path: file_path.to_string(),
                bytes_written,
                backup_path: None,
                success: true,
            })
        }
        Err(e) => {
            rollback(&tmp_path, backup_path.as_deref()).await;
            Err(WriteError {
                path: file_path.to_string(),
                error: format!("Failed to atomic-rename temp to target: {}", e),
                backup_preserved: has_backup,
                backup_path: backup_path.map(|p| p.to_string_lossy().into_owned()),
            })
        }
    }
}
