const signupMsg = document.getElementById("signupMsg")
const signupBtn = document.getElementById("signupBtn")

function showSignupMsg(text, isError = true) {
  if (!signupMsg) return
  signupMsg.textContent = text
  signupMsg.classList.remove("hidden")
  signupMsg.classList.toggle("form-msg-error", isError)
  signupMsg.classList.toggle("form-msg-success", !isError)
}

function hideSignupMsg() {
  signupMsg?.classList.add("hidden")
}

async function handleSignup() {
  const supabase = window.supabaseClient

  const email = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value
  const confirmPassword = document.getElementById("confirmPassword").value

  hideSignupMsg()

  if (!email || !password) {
    showSignupMsg("Please fill all fields.")
    return
  }

  if (password.length < 6) {
    showSignupMsg("Password must be at least 6 characters.")
    return
  }

  if (password !== confirmPassword) {
    showSignupMsg("Passwords do not match.")
    return
  }

  signupBtn.disabled = true
  signupBtn.textContent = "Creating account..."

  const { data, error } = await supabase.auth.signUp({ email, password })

  signupBtn.disabled = false
  signupBtn.textContent = "Create account"

  if (error) {
    if (/already/i.test(error.message)) {
      showSignupMsg("This email is already registered. Please log in instead.")
    } else {
      showSignupMsg(error.message)
    }
    return
  }

  if (data?.user && !data.session) {
    showSignupMsg(
      "Account created. Please check your inbox to confirm your email before logging in.",
      false
    )
    return
  }

  showSignupMsg("Account created. Redirecting...", false)
  window.location.href = "onboarding.html"
}

signupBtn.addEventListener("click", handleSignup)

;["email", "password", "confirmPassword"].forEach((id) => {
  document.getElementById(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSignup()
  })
})
