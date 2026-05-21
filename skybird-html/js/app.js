function renderShell() {
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

// (Register tab removed — accounts are created by admin from Staff page)


$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("#login-error").textContent = "";
  try {
    await Auth.login(fd.get("email"), fd.get("password"));
    renderShell();
    toast("Welcome back", "success");
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});
$("#btn-logout").onclick = () => Auth.logout();

(async () => {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" && session?.user) return;
    if (event === "SIGNED_OUT") {
      Auth.user = null;
      Store.cache = {};
      renderShell();
      return;
    }
    if (session?.user) {
      void (async () => {
        Store.cache = {};
        await Auth.loadMe();
        renderShell();
      })();
    }
  });
  const ok = await Auth.loadMe();
  if (!ok) {
    renderShell();
    return;
  }
  renderShell();
})();
