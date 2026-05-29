import { getActiveView } from "./partnerLinks.js"

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function loadHeader() {

  const supabase = window.supabaseClient

  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    return
  }

  const activeView = getActiveView()

  const todayLabel = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric"
  })

  const homeHref =
    activeView.kind === "partner" && activeView.ownerId
      ? `partner.html?owner=${encodeURIComponent(activeView.ownerId)}`
      : "dashboard.html"

  document.getElementById("headerContainer").innerHTML = `
    <header class="header">

      <div class="header-left">
        <a href="${homeHref}" class="header-home-link" aria-label="Go to dashboard">
          <h2>Bloom</h2>
        </a>
      </div>

      <div class="header-center" id="todayDate">${todayLabel}</div>

      <div class="header-right">
        <button type="button" id="settingsToggle" class="gear-btn" aria-label="Settings" aria-expanded="false">
          <svg class="gear-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
          </svg>
        </button>
        <div id="settingsMenu" class="header-menu hidden">
          <div class="header-menu-greeting">
            <div class="header-menu-greeting-label">Logged in as</div>
            <div class="header-menu-greeting-email" title="${escapeHtml(user.email)}">${escapeHtml(user.email)}</div>
          </div>
          <a href="settings.html" class="header-menu-item">Settings</a>
          <button type="button" id="logoutBtn" class="header-menu-item header-menu-logout">Logout</button>
        </div>
      </div>

    </header>
  `

  const toggle = document.getElementById("settingsToggle")
  const menu = document.getElementById("settingsMenu")

  const closeMenu = () => {
    menu?.classList.add("hidden")
    toggle?.setAttribute("aria-expanded", "false")
  }

  toggle?.addEventListener("click", (e) => {
    e.stopPropagation()
    const open = menu?.classList.toggle("hidden")
    toggle.setAttribute("aria-expanded", open ? "false" : "true")
  })

  document.addEventListener("click", closeMenu)
  menu?.addEventListener("click", (e) => e.stopPropagation())

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await supabase.auth.signOut()
    window.location.href = "index.html"
  })
}
