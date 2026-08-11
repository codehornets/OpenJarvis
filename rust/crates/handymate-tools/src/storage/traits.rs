//! MemoryBackend trait for all storage backends.

use handymate_core::{HandymateError, RetrievalResult};
use serde_json::Value;

pub trait MemoryBackend: Send + Sync {
    fn backend_id(&self) -> &str;
    fn store(
        &self,
        content: &str,
        source: &str,
        metadata: Option<&Value>,
    ) -> Result<String, HandymateError>;
    fn retrieve(
        &self,
        query: &str,
        top_k: usize,
    ) -> Result<Vec<RetrievalResult>, HandymateError>;
    fn delete(&self, doc_id: &str) -> Result<bool, HandymateError>;
    fn clear(&self) -> Result<(), HandymateError>;
    fn count(&self) -> Result<usize, HandymateError>;
}
