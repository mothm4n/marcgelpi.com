const copyEmailButton = document.querySelector("[data-copy-email]");
const copyEmailStatus = document.querySelector("[data-copy-email-status]");

if (copyEmailButton && copyEmailStatus) {
  copyEmailButton.addEventListener("click", async () => {
    const email = copyEmailButton.dataset.email;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable");
      }

      await navigator.clipboard.writeText(email);
      copyEmailStatus.textContent = "Email copied";
    } catch {
      copyEmailStatus.textContent = `Copy unavailable. Select and copy ${email} manually.`;
    }
  });
}
