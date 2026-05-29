import { getPostAuthRedirect } from "./profile.js"

const loginMsg = document.getElementById("loginMsg")
const loginBtn = document.getElementById("loginBtn")

function showLoginMsg(text, isError = true) {
  if (!loginMsg) return
  loginMsg.textContent = text
  loginMsg.classList.remove("hidden")
  loginMsg.classList.toggle("form-msg-error", isError)
  loginMsg.classList.toggle("form-msg-success", !isError)
}

function hideLoginMsg() {
  loginMsg?.classList.add("hidden")
}

async function handleLogin() {
  const supabase = window.supabaseClient

  const email = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value

  hideLoginMsg()

  if (!email || !password) {
    showLoginMsg("Please enter your email and password.")
    return
  }

  loginBtn.disabled = true
  loginBtn.textContent = "Logging in..."

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    loginBtn.disabled = false
    loginBtn.textContent = "Log in"

    if (/invalid login credentials/i.test(error.message)) {
      showLoginMsg("Wrong email or password. Please try again.")
    } else if (/email not confirmed/i.test(error.message)) {
      showLoginMsg("Please confirm your email first. Check your inbox.")
    } else {
      showLoginMsg(error.message)
    }
    return
  }

  showLoginMsg("Logged in. Redirecting...", false)

  try {
    const redirect = await getPostAuthRedirect(supabase, data.user)
    window.location.href = redirect
  } catch (err) {
    loginBtn.disabled = false
    loginBtn.textContent = "Log in"
    showLoginMsg(err.message || "Could not load your profile. Please try again.")
  }
}

loginBtn.addEventListener("click", handleLogin)

document.getElementById("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin()
})
document.getElementById("email").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin()
})
