//! Catalogue produits — chargé au démarrage depuis `apps/web/content/products/*.md`.
//!
//! Source de vérité éditoriale = Decap CMS (commits Markdown). Le back-end
//! parse les frontmatter au boot pour avoir les prix + variantes en mémoire
//! et VALIDER les checkouts (un client ne peut pas tricher sur le prix).
//!
//! Path configurable via `ALARTIC_PRODUCTS_DIR`. Par défaut, résolu relatif
//! à `CARGO_MANIFEST_DIR` (dev workspace). En prod, le pipeline CI copie
//! `apps/web/content/products/` à côté du binaire et pointe l'env var dessus.
//!
//! Plus tard (J4 back-office) : endpoint `POST /admin/products/reload` pour
//! re-parser sans redémarrer. Pour MVP J4, restart suffit.

use serde::Deserialize;
use std::{collections::HashMap, path::Path, sync::Arc};
use thiserror::Error;
use tracing::{info, warn};

#[derive(Debug, Error)]
pub enum ProductsError {
    #[error("I/O error reading {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("Frontmatter parse error in {path}: {detail}")]
    Frontmatter { path: String, detail: String },
    #[error("Products directory not found: {0}. Set ALARTIC_PRODUCTS_DIR.")]
    DirNotFound(String),
    #[error("No product loaded from {0}")]
    Empty(String),
}

/// Frontmatter d'un .md catalogue, désérialisé depuis YAML. On n'extrait que
/// les champs dont l'API a besoin (les autres — `included`, `specs`, etc. —
/// restent côté front).
#[derive(Debug, Deserialize)]
struct RawProductFrontmatter {
    name: String,
    available: Option<bool>,
    colors: Vec<RawColor>,
    storages: Vec<RawStorage>,
}

#[derive(Debug, Deserialize)]
struct RawColor {
    slug: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct RawStorage {
    slug: String,
    label: String,
    /// Prix en euros entiers (frontmatter Decap). Converti en centimes
    /// à l'ingestion.
    price: u64,
}

#[derive(Debug, Clone)]
pub struct Product {
    pub slug: String,
    pub name: String,
    pub available: bool,
    pub colors: HashMap<String, String>,
    /// Map storage_slug -> (label, unit_price_cents)
    pub storages: HashMap<String, (String, i64)>,
}

#[derive(Debug, Clone)]
pub struct VariantResolved {
    pub product_name: String,
    pub color_name: String,
    pub storage_label: String,
    pub unit_price_cents: i64,
}

#[derive(Debug, Clone, Default)]
pub struct Catalog {
    by_slug: HashMap<String, Product>,
}

impl Catalog {
    /// Résout (slug produit, slug couleur, slug stockage) → labels + prix.
    /// Renvoie None si l'un des composants est inconnu ou si le produit n'est
    /// pas disponible (`available: false`).
    pub fn resolve_variant(
        &self,
        product_slug: &str,
        color_slug: &str,
        storage_slug: &str,
    ) -> Option<VariantResolved> {
        let product = self.by_slug.get(product_slug)?;
        if !product.available {
            return None;
        }
        let color_name = product.colors.get(color_slug)?.clone();
        let (storage_label, unit_price_cents) = product.storages.get(storage_slug)?.clone();
        Some(VariantResolved {
            product_name: product.name.clone(),
            color_name,
            storage_label,
            unit_price_cents,
        })
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.by_slug.len()
    }

    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.by_slug.is_empty()
    }
}

/// Charge le catalogue depuis le répertoire `dir`. Retourne un `Arc` pour le
/// stocker partagé dans l'`AppState` sans Mutex (lecture seule après boot).
pub fn load_from_dir(dir: &Path) -> Result<Arc<Catalog>, ProductsError> {
    if !dir.exists() {
        return Err(ProductsError::DirNotFound(dir.display().to_string()));
    }

    let mut catalog = Catalog::default();
    let read_dir = std::fs::read_dir(dir).map_err(|source| ProductsError::Io {
        path: dir.display().to_string(),
        source,
    })?;

    for entry in read_dir {
        let entry = entry.map_err(|source| ProductsError::Io {
            path: dir.display().to_string(),
            source,
        })?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| ProductsError::Frontmatter {
                path: path.display().to_string(),
                detail: "invalid filename".into(),
            })?
            .to_string();

        let raw = std::fs::read_to_string(&path).map_err(|source| ProductsError::Io {
            path: path.display().to_string(),
            source,
        })?;

        let matter = gray_matter::Matter::<gray_matter::engine::YAML>::new();
        let parsed =
            matter
                .parse_with_struct::<RawProductFrontmatter>(&raw)
                .ok_or_else(|| ProductsError::Frontmatter {
                    path: path.display().to_string(),
                    detail: "missing or invalid frontmatter".into(),
                })?;

        let fm = parsed.data;
        let product = Product {
            slug: slug.clone(),
            name: fm.name,
            available: fm.available.unwrap_or(true),
            colors: fm
                .colors
                .into_iter()
                .map(|c| (c.slug, c.name))
                .collect(),
            storages: fm
                .storages
                .into_iter()
                .map(|s| (s.slug, (s.label, (s.price as i64) * 100)))
                .collect(),
        };
        catalog.by_slug.insert(slug, product);
    }

    if catalog.by_slug.is_empty() {
        warn!("Aucun produit chargé depuis {}", dir.display());
        return Err(ProductsError::Empty(dir.display().to_string()));
    }

    info!(
        "Catalogue chargé : {} produits depuis {}",
        catalog.by_slug.len(),
        dir.display()
    );
    Ok(Arc::new(catalog))
}
