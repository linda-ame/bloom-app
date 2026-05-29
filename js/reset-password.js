const supabase = window.supabaseClient

const resetMsg = document.getElementById("resetMsg")
const resetBtn = document.getElementById("resetBtn")

function showResetMsg(text, isError = true) {
  if (!resetMsg) return
  resetMsg.textContent = text
  resetMsg.classList.remove("hidden")
  resetMsg.classList.toggle("form-msg-error", isError)
  resetMsg.classList.toggle("form-msg-success", !isError)
}

function hideResetMsg() {
  resetMsg?.classList.add("hidden")
}

async function handleResetRequest() {
  const email = document.getElementById("email")?.value.trim()

  hideResetMsg()

  if (!email) {
    showResetMsg("Please enter your email address.")
    return
  }

  resetBtn.disabled = true
  resetBtn.textContent = "Sending..."

  const redirectTo = `${window.location.origin}/update-password.html`

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  })

  resetBtn.disabled = false
  resetBtn.textContent = "Send reset link"

  if (error) {
    showResetMsg(error.message)
    return
  }

  showResetMsg(
    "Check your inbox for a password reset link. It may take a minute to arrive.",
    false
  )
}

resetBtn?.addEventListener("click", handleResetRequest)

document.getElementById("email")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleResetRequest()
})
