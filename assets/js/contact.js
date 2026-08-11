const copyEmailButton = document.querySelector("[data-copy-email]");
const copyEmailStatus = document.querySelector("[data-copy-email-status]");

if (copyEmailButton && copyEmailStatus) {
  copyEmailButton.addEventListener("click", async () => {
    const email = copyEmailButton.dataset.email;
    const successMessage = copyEmailButton.dataset.successMessage;
    const failureMessage = copyEmailButton.dataset.failureMessage;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable");
      }

      await navigator.clipboard.writeText(email);
      copyEmailStatus.textContent = successMessage;
    } catch {
      copyEmailStatus.textContent = failureMessage;
    }
  });
}
