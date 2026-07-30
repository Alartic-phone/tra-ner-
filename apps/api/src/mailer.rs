//! SMTP minimal + variant in-memory pour les tests.
//!
//! En prod : `Mailer::smtp(cfg)` avec STARTTLS Infomaniak.
//! En dev : `Mailer::smtp(cfg)` vers Mailpit (port 1025, sans TLS).
//! En test : `Mailer::in_memory()` — pas de socket, on inspecte `MailRecord`.

use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Attachment, Mailbox, MultiPart, SinglePart, header::ContentType},
    transport::smtp::authentication::Credentials,
};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, thiserror::Error)]
pub enum MailerError {
    #[error("SMTP build error: {0}")]
    Build(#[from] lettre::error::Error),
    #[error("SMTP transport error: {0}")]
    Transport(#[from] lettre::transport::smtp::Error),
    #[error("invalid From address: {0}")]
    InvalidFrom(#[from] lettre::address::AddressError),
}

pub struct MailerConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub from: String,
    pub use_tls: bool,
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct MailRecord {
    pub to: String,
    pub subject: String,
    pub body: String,
    /// Pièces jointes (name, bytes). Vide pour les emails simples (magic link,
    /// contact). Renseigné pour les emails transactionnels avec PDF (facture).
    pub attachments: Vec<MailAttachment>,
}

#[derive(Clone, Debug)]
pub struct MailAttachment {
    pub filename: String,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

impl MailRecord {
    /// Extrait le premier lien `http(s)://...` du body. Utile pour les tests
    /// d'intégration qui doivent récupérer le magic link envoyé.
    pub fn link(&self) -> Option<String> {
        let start = self.body.find("http")?;
        let rest = &self.body[start..];
        let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        Some(rest[..end].to_string())
    }
}

#[derive(Clone)]
pub enum Mailer {
    Smtp(SmtpMailer),
    InMemory(InMemoryMailer),
}

#[derive(Clone)]
pub struct SmtpMailer {
    transport: Arc<AsyncSmtpTransport<Tokio1Executor>>,
    from: Mailbox,
}

#[derive(Default, Clone)]
pub struct InMemoryMailer {
    pub sent: Arc<Mutex<Vec<MailRecord>>>,
}

impl Mailer {
    pub fn smtp(cfg: MailerConfig) -> Result<Self, MailerError> {
        Ok(Self::Smtp(SmtpMailer::new(cfg)?))
    }

    /// Crée un Mailer in-memory et renvoie l'inbox partagée (clone d'`Arc`).
    /// Le test peut lire l'inbox pour récupérer les liens.
    #[allow(dead_code)]
    pub fn in_memory() -> (Self, Arc<Mutex<Vec<MailRecord>>>) {
        let m = InMemoryMailer::default();
        let inbox = m.sent.clone();
        (Self::InMemory(m), inbox)
    }

    pub async fn send_magic_link(
        &self,
        to_email: &str,
        link: &str,
    ) -> Result<(), MailerError> {
        // Construit un body texte minimaliste (réutilisé par les deux variantes).
        let subject = "Votre lien de connexion ALARTIC";
        let body = format!(
            "Bonjour,\n\n\
             Vous avez demandé un lien de connexion à votre espace ALARTIC.\n\n\
             Cliquez ici (valide 15 minutes, usage unique) :\n{link}\n\n\
             Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n\
             — ALARTIC\n"
        );
        self.send_text(to_email, subject, &body).await
    }

    /// Email de confirmation de commande payée. Envoyé depuis le webhook
    /// Payplug après vérification (CDC §9.6).
    pub async fn send_order_confirmation(
        &self,
        to_email: &str,
        details: &OrderEmailDetails<'_>,
    ) -> Result<(), MailerError> {
        let subject = format!("Commande ALARTIC #{} — confirmée", details.short_id());
        let body = format_order_confirmation(details);
        self.send_text(to_email, &subject, &body).await
    }

    /// Variante avec facture PDF attachée. Préférée dès qu'on a un numéro de
    /// facture attribué (CDC §9.6 — "facture PDF en attachment").
    pub async fn send_order_confirmation_with_invoice(
        &self,
        to_email: &str,
        details: &OrderEmailDetails<'_>,
        invoice_filename: &str,
        invoice_pdf: Vec<u8>,
    ) -> Result<(), MailerError> {
        let subject = format!("Commande ALARTIC #{} — confirmée", details.short_id());
        let body = format_order_confirmation(details);
        let attachment = MailAttachment {
            filename: invoice_filename.to_string(),
            content_type: "application/pdf".to_string(),
            bytes: invoice_pdf,
        };
        self.send_with_attachment(to_email, &subject, &body, attachment).await
    }

    async fn send_with_attachment(
        &self,
        to_email: &str,
        subject: &str,
        body: &str,
        attachment: MailAttachment,
    ) -> Result<(), MailerError> {
        match self {
            Self::Smtp(s) => s.send_with_attachment(to_email, subject, body, attachment).await,
            Self::InMemory(m) => {
                m.sent.lock().await.push(MailRecord {
                    to: to_email.to_string(),
                    subject: subject.to_string(),
                    body: body.to_string(),
                    attachments: vec![attachment],
                });
                Ok(())
            }
        }
    }

    /// Envoi générique texte. Utilisé pour le formulaire /contact, les
    /// confirmations de changement d'email, et plus tard les notifications
    /// transactionnelles admin → user.
    pub async fn send_text(
        &self,
        to_email: &str,
        subject: &str,
        body: &str,
    ) -> Result<(), MailerError> {
        match self {
            Self::Smtp(s) => s.send_text(to_email, subject, body).await,
            Self::InMemory(m) => {
                m.sent.lock().await.push(MailRecord {
                    to: to_email.to_string(),
                    subject: subject.to_string(),
                    body: body.to_string(),
                    attachments: Vec::new(),
                });
                Ok(())
            }
        }
    }
}

// ───────────────────────── Templates ─────────────────────────

/// Détails à injecter dans le mail de confirmation de commande. Les références
/// sont OK (le template formate puis envoie immédiatement, pas de stockage).
pub struct OrderEmailDetails<'a> {
    pub order_id: &'a str,
    pub first_name: &'a str,
    pub items: &'a [OrderEmailItem<'a>],
    pub subtotal_cents: i64,
    pub shipping_cents: i64,
    pub total_cents: i64,
    /// URL absolue vers l'espace client (suivi de commande).
    pub account_url: &'a str,
}

pub struct OrderEmailItem<'a> {
    pub product_name: &'a str,
    pub variant_color_name: &'a str,
    pub variant_storage_label: &'a str,
    pub qty: i32,
    pub unit_price_cents: i64,
    pub line_total_cents: i64,
}

impl OrderEmailDetails<'_> {
    fn short_id(&self) -> String {
        self.order_id.chars().take(8).collect()
    }
}

fn euros(cents: i64) -> String {
    // Format français : "1 234,56 €" — sans dépendance ICU pour rester léger.
    let abs = cents.unsigned_abs();
    let euros = abs / 100;
    let cents_part = abs % 100;
    let euros_str = group_thousands(euros);
    format!("{euros_str},{cents_part:02} €")
}

fn group_thousands(n: u64) -> String {
    let s = n.to_string();
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 && (bytes.len() - i).is_multiple_of(3) {
            out.push(' ');
        }
        out.push(*b as char);
    }
    out
}

fn format_order_confirmation(d: &OrderEmailDetails<'_>) -> String {
    let mut body = String::new();
    body.push_str(&format!(
        "Bonjour {first},\n\n\
         Votre commande a bien été reçue et le paiement est confirmé.\n\n\
         ═══════════════════════════════\n\
         Commande #{id}\n\
         ═══════════════════════════════\n\n",
        first = d.first_name,
        id = d.short_id(),
    ));

    for it in d.items {
        body.push_str(&format!(
            "  {name} — {storage} — {color}\n      {price} × {qty}    = {line}\n\n",
            name = it.product_name,
            storage = it.variant_storage_label,
            color = it.variant_color_name,
            price = euros(it.unit_price_cents),
            qty = it.qty,
            line = euros(it.line_total_cents),
        ));
    }

    body.push_str(&format!(
        "  ─────────────────────────────\n\
         \n\
         Sous-total :    {subtotal}\n\
         Livraison  :    {shipping}\n\
         Total TTC  :    {total}\n\n",
        subtotal = euros(d.subtotal_cents),
        shipping = if d.shipping_cents == 0 {
            "Offerte".to_string()
        } else {
            euros(d.shipping_cents)
        },
        total = euros(d.total_cents),
    ));

    body.push_str(&format!(
        "Prochaines étapes\n\
         ─────────────────\n\
         1. Préparation de votre appareil sous scellé numéroté, devant caméra\n\
         2. Expédition sous 5 à 7 jours ouvrés, avec numéro de suivi par email\n\
         3. À réception : vérifiez l'intégrité du scellé. S'il est rompu,\n\
            contactez immédiatement le SAV (remplacement gratuit, sans discussion).\n\n\
         Suivi de votre commande :\n{account}\n\n\
         Merci pour votre confiance.\n\n\
         — L'équipe ALARTIC\n",
        account = d.account_url,
    ));

    body
}

impl SmtpMailer {
    fn new(cfg: MailerConfig) -> Result<Self, MailerError> {
        let mut builder = if cfg.use_tls {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.host)?
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&cfg.host)
        };
        builder = builder.port(cfg.port);
        if !cfg.user.is_empty() {
            builder = builder.credentials(Credentials::new(cfg.user, cfg.password));
        }
        Ok(Self {
            transport: Arc::new(builder.build()),
            from: cfg.from.parse()?,
        })
    }

    async fn send_text(
        &self,
        to_email: &str,
        subject: &str,
        body: &str,
    ) -> Result<(), MailerError> {
        let msg = Message::builder()
            .from(self.from.clone())
            .to(to_email.parse()?)
            .subject(subject)
            .header(ContentType::TEXT_PLAIN)
            .body(body.to_string())?;

        self.transport.send(msg).await?;
        Ok(())
    }

    async fn send_with_attachment(
        &self,
        to_email: &str,
        subject: &str,
        body: &str,
        attachment: MailAttachment,
    ) -> Result<(), MailerError> {
        let pdf_ct: ContentType = attachment
            .content_type
            .parse()
            .unwrap_or(ContentType::parse("application/pdf").unwrap());
        let multipart = MultiPart::mixed()
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(body.to_string()),
            )
            .singlepart(Attachment::new(attachment.filename).body(attachment.bytes, pdf_ct));

        let msg = Message::builder()
            .from(self.from.clone())
            .to(to_email.parse()?)
            .subject(subject)
            .multipart(multipart)?;

        self.transport.send(msg).await?;
        Ok(())
    }
}

#[cfg(test)]
mod template_tests {
    use super::*;

    #[test]
    fn euros_formats_french_with_thousands_and_cents() {
        assert_eq!(euros(0), "0,00 €");
        assert_eq!(euros(50), "0,50 €");
        assert_eq!(euros(89900), "899,00 €");
        assert_eq!(euros(12_345_678), "123 456,78 €");
        assert_eq!(euros(100_000_000), "1 000 000,00 €");
    }

    #[test]
    fn order_confirmation_contains_all_essentials() {
        let order_id = "abc12345-deadbeef-1234567890ab";
        let items = vec![OrderEmailItem {
            product_name: "Pixel 9",
            variant_color_name: "Noir Volcanique",
            variant_storage_label: "128 Go",
            qty: 1,
            unit_price_cents: 89900,
            line_total_cents: 89900,
        }];
        let account_url = "https://alartic.fr/compte".to_string();
        let d = OrderEmailDetails {
            order_id,
            first_name: "Alice",
            items: &items,
            subtotal_cents: 89900,
            shipping_cents: 0,
            total_cents: 89900,
            account_url: &account_url,
        };
        let body = format_order_confirmation(&d);
        assert!(body.contains("Bonjour Alice"));
        assert!(body.contains("#abc12345"));
        assert!(body.contains("Pixel 9"));
        assert!(body.contains("Noir Volcanique"));
        assert!(body.contains("128 Go"));
        assert!(body.contains("899,00 €"));
        assert!(body.contains("Offerte"));
        assert!(body.contains("https://alartic.fr/compte"));
        assert!(body.contains("scellé"));
    }
}
