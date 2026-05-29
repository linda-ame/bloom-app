import { loadHeader } from "./header.js"
import { fetchUserProfile, isProfileComplete } from "./profile.js"
import {
  acceptPendingInvites,
  listAcceptedPartnersForMe,
  pickPartnerOwnerId,
  getActiveView
} from "./partnerLinks.js"

const supabase = window.supabaseClient

async function checkUser() {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    window.location.href = "index.html"
    return
  }

  await acceptPendingInvites(supabase, user)

  const profile = await fetchUserProfile(supabase, user.id)
  if (isProfileComplete(profile)) {
    window.location.href = "dashboard.html"
    return
  }

  const partners = await listAcceptedPartnersForMe(supabase, user)
  if (partners.length > 0) {
    const ownerId = pickPartnerOwnerId(partners, getActiveView())
    window.location.href = `partner.html?owner=${encodeURIComponent(ownerId)}`
    return
  }

  await loadHeader()

  const box = document.querySelector(".form-box")
  if (box && !document.getElementById("partnerSkipHint")) {
    const hint = document.createElement("p")
    hint.id = "partnerSkipHint"
    hint.className = "onboarding-partner-skip"
    hint.textContent =
      "Were you invited as a partner? Log in with the email your partner used for the invite — you can view their data without filling this form."
    box.insertBefore(hint, box.firstChild)
  }
}

checkUser()

window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("saveBtn")
  if (!btn) return

  btn.addEventListener("click", async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const user = userData?.user

    if (userError || !user) {
      alert("User not logged in")
      window.location.href = "index.html"
      return
    }

    const cycle_length = document.getElementById("cycleLength").value
    const period_length = document.getElementById("periodLength").value
    const last_period_start = document.getElementById("lastPeriodStart").value

    if (!cycle_length || !period_length || !last_period_start) {
      alert("Please fill all fields")
      return
    }

    const { error } = await supabase.from("profiles").upsert([
      {
        id: user.id,
        cycle_length: Number(cycle_length),
        period_length: Number(period_length),
        last_period_start
      }
    ])

    if (error) {
      alert(error.message)
      return
    }

    alert("Profile saved successfully!")
    setTimeout(() => {
      window.location.href = "dashboard.html"
    }, 500)
  })
})
