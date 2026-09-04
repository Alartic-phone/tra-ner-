// Dialogs custom — remplace les `alert()` / `confirm()` / `prompt()` natifs
// qui affichent un préfixe "localhost:4321 indique" et un look système moche.
//
// Implémentation : <dialog> HTML natif (showModal centré, backdrop natif,
// touche Escape gérée par le browser). Aucune dépendance externe.

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ad";
    dialog.innerHTML = `
      <div class="ad__body">
        <h2 class="ad__title">${escapeHtml(opts.title)}</h2>
        <p class="ad__text">${escapeHtml(opts.body).replace(/\n/g, "<br>")}</p>
        <div class="ad__actions">
          <button type="button" class="ad__btn" data-cancel>${escapeHtml(
            opts.cancelLabel ?? "Annuler"
          )}</button>
          <button type="button" class="ad__btn ${
            opts.danger ? "ad__btn--danger" : "ad__btn--primary"
          }" data-confirm>${escapeHtml(opts.confirmLabel ?? "Confirmer")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    const finish = (value: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.querySelector<HTMLButtonElement>("[data-cancel]")?.addEventListener(
      "click",
      () => finish(false)
    );
    dialog.querySelector<HTMLButtonElement>("[data-confirm]")?.addEventListener(
      "click",
      () => finish(true)
    );
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish(false);
    });
    dialog.showModal();
    dialog
      .querySelector<HTMLButtonElement>("[data-confirm]")
      ?.focus();
  });
}

export interface PromptOptions {
  title: string;
  body: string;
  placeholder?: string;
  /** Si défini, le bouton confirmer reste désactivé tant que la valeur ≠. */
  expectedValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ad";
    dialog.innerHTML = `
      <form class="ad__body" data-form>
        <h2 class="ad__title">${escapeHtml(opts.title)}</h2>
        <p class="ad__text">${escapeHtml(opts.body).replace(/\n/g, "<br>")}</p>
        <input
          type="text"
          class="ad__input"
          placeholder="${escapeHtml(opts.placeholder ?? "")}"
          autocomplete="off"
          autocapitalize="off"
        />
        <div class="ad__actions">
          <button type="button" class="ad__btn" data-cancel>${escapeHtml(
            opts.cancelLabel ?? "Annuler"
          )}</button>
          <button type="submit" class="ad__btn ${
            opts.danger ? "ad__btn--danger" : "ad__btn--primary"
          }" ${opts.expectedValue ? "disabled" : ""}>${escapeHtml(
      opts.confirmLabel ?? "Confirmer"
    )}</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    const input = dialog.querySelector<HTMLInputElement>("input.ad__input")!;
    const confirmBtn = dialog.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )!;
    const form = dialog.querySelector<HTMLFormElement>("[data-form]")!;
    const finish = (value: string | null) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.querySelector<HTMLButtonElement>("[data-cancel]")?.addEventListener(
      "click",
      () => finish(null)
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (opts.expectedValue && input.value !== opts.expectedValue) return;
      finish(input.value);
    });
    if (opts.expectedValue) {
      input.addEventListener("input", () => {
        confirmBtn.disabled = input.value !== opts.expectedValue;
      });
    }
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish(null);
    });
    dialog.showModal();
    setTimeout(() => input.focus(), 0);
  });
}

export interface AlertOptions {
  title: string;
  body: string;
  variant?: "info" | "error";
}

export function alertDialog(opts: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = `ad ad--${opts.variant ?? "info"}`;
    dialog.innerHTML = `
      <div class="ad__body">
        <h2 class="ad__title">${escapeHtml(opts.title)}</h2>
        <p class="ad__text">${escapeHtml(opts.body).replace(/\n/g, "<br>")}</p>
        <div class="ad__actions ad__actions--end">
          <button type="button" class="ad__btn ad__btn--primary" data-ok>OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    const finish = () => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    dialog.querySelector<HTMLButtonElement>("[data-ok]")?.addEventListener(
      "click",
      finish
    );
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish();
    });
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("[data-ok]")?.focus();
  });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!
  );
}
