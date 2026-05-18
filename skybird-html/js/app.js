function renderShell(){
  if (Auth.user) {
    $("#login-view").classList.add("hidden");
    $("#app-view").classList.remove("hidden");
    $("#user-name").textContent = Auth.user.email;
    $("#user-role").textContent = Auth.role || "—";
    $("#agency-name").textContent = Auth.agency?.agency_name || "Skybird";
    if (!location.hash) location.hash = "#/dashboard";
    renderRoute();
  } else {
    $("#app-view").classList.add("hidden");
    $("#login-view").classList.remove("hidden");
  }
}

// tab toggling
$$(".tab").forEach(t => t.onclick = () => {
  $$(".tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  $("#form-login").classList.toggle("hidden", t.dataset.tab !== "login");
  $("#form-register").classList.toggle("hidden", t.dataset.tab !== "register");
});

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("#login-error").textContent = "";
  try { await Auth.login(fd.get("email"), fd.get("password")); renderShell(); toast("Welcome back","success"); }
  catch(err){ $("#login-error").textContent = err.message; }
});
$("#form-register").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("#register-error").textContent = "";
  try { await Auth.register(fd.get("name"), fd.get("email"), fd.get("password")); renderShell(); toast("Account created","success"); }
  catch(err){ $("#register-error").textContent = err.message; }
});
$("#btn-logout").onclick = () => Auth.logout();

(async () => {
  const ok = await Auth.loadMe();
  if (!ok) { renderShell(); return; }
  renderShell();
})();
