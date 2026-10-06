const signupForm = document.querySelector("#signupForm");
const signupError = document.querySelector("#signupError");
const signupRole = document.querySelector("#signupRole");
const workerFields = document.querySelector("#workerFields");
const signupUsername = document.querySelector("#signupUsername");

const updateSignupFields = () => {
  const isWorker = signupRole.value === "worker";
  workerFields.classList.toggle("hidden", !isWorker);
  signupUsername.placeholder = isWorker ? "Enter your worker ID" : "Choose a username";
  signupUsername.setAttribute("aria-label", isWorker ? "Worker ID" : "Username");
};

signupRole.addEventListener("change", updateSignupFields);
updateSignupFields();

signupForm.addEventListener("submit", async event => {
  event.preventDefault();
  signupError.classList.add("hidden");
  const form = new FormData(signupForm);
  const payload = Object.fromEntries(form.entries());

  try {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Account creation failed.");
    window.location.assign(result.redirect);
  } catch (error) {
    signupError.textContent = error.message;
    signupError.classList.remove("hidden");
  }
});
