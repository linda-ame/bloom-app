import { getPostAuthRedirect } from "./profile.js?v=1"

const supabase = window.supabaseClient

const updateMsg = document.getElementById("updateMsg")
const saveBtn = document.getElementById("savePasswordBtn")
const newPasswordEl = document.getElementById("newPassword")
const confirmPasswordEl = document.getElementById("confirmPassword")

let recoveryReady = false

function showUpdateMsg(text, isError = true) {
  if (!updateMsg) return
  updateMsg.textContent = text
  updateMsg.classList.remove("hidden")
  updateMsg.classList.toggle("form-msg-error", isError)
  updateMsg.classList.toggle("form-msg-success", !isError)
}

function hideUpdateMsg() {
  updateMsg?.classList.add("hidden")
}

function setFormEnabled(enabled) {
  if (saveBtn) saveBtn.disabled = !enabled
  newPasswordEl?.toggleAttribute("disabled", !enabled)
  confirmPasswordEl?.toggleAttribute("disabled", !enabled)
}

function waitForRecoverySession(timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false

    const finish = (session) => {
      if (settled) return
      settled = true
      resolve(session)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" || session) {
          finish(session)
        }
      }
    )

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(session)
    })

    setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      subscription.unsubscribe()
      finish(session)
    }, timeoutMs)
  })
}

async function initRecoveryPage() {
  setFormEnabled(false)
  showUpdateMsg("Verifying reset link...", false)

  const session = await waitForRecoverySession()

  if (!session?.user) {
    setFormEnabled(false)
    showUpdateMsg(
      "This reset link is invalid or has expired. Please request a new one.",
      true
    )
    return
  }

  recoveryReady = true
  hideUpdateMsg()
  setFormEnabled(true)
  newPasswordEl?.focus()
}

async function handleSavePassword() {
  hideUpdateMsg()

  if (!recoveryReady) {
    showUpdateMsg(
      "This reset link is invalid or has expired. Please request a new one.",
      true
    )
    return
  }

  const password = newPasswordEl?.value || ""
  const confirm = confirmPasswordEl?.value || ""

  if (password.length < 6) {
    showUpdateMsg("Password must be at least 6 characters.", true)
    return
  }

  if (password !== confirm) {
    showUpdateMsg("Passwords do not match.", true)
    return
  }

  saveBtn.disabled = true
  saveBtn.textContent = "Saving..."

  const { data, error } = await supabase.auth.updateUser({ password })

  if (error) {
    saveBtn.disabled = false
    saveBtn.textContent = "Save new password"
    showUpdateMsg(error.message, true)
    return
  }

  showUpdateMsg("Password updated. Redirecting...", false)

  try {
    const redirect = await getPostAuthRedirect(supabase, data.user)
    window.location.href = redirect
  } catch (err) {
    saveBtn.disabled = false
    saveBtn.textContent = "Save new password"
    showUpdateMsg(err.message || "Could not redirect. Please log in.", true)
  }
}

saveBtn?.addEventListener("click", handleSavePassword)

;[newPasswordEl, confirmPasswordEl].forEach((el) => {
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && recoveryReady) handleSavePassword()
  })
})

initRecoveryPage().catch((err) => {
  console.error(err)
  showUpdateMsg("Something went wrong. Please try again.", true)
})
