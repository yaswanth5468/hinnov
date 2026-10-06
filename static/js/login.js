const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const roleSelect = document.querySelector("#portalRole");
const usernameInput = document.querySelector("#loginUsername");
const demoCredentials = document.querySelector("#demoCredentials");

roleSelect.addEventListener("change", () => {
  usernameInput.placeholder = roleSelect.value === "worker" ? "Enter your worker ID" : "Enter your username";
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.classList.add("hidden");
  const form = new FormData(loginForm);
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign in failed.");
    window.location.assign(result.redirect);
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.remove("hidden");
  }
});
