import { loadHeader } from "./header.js"
import { acceptPendingInvites, listMyInvites } from "./partnerLinks.js"

const supabase = window.supabaseClient

function showMsg(el, text, isError = false) {
  if (!el) return
  el.textContent = text
  el.classList.remove("hidden")
  el.classList.toggle("settings-msg-error", isError)
  el.classList.toggle("settings-msg-success", !isError)
}

function hideMsg(el) {
  el?.classList.add("hidden")
}

async function initSettings() {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    window.location.href = "index.html"
    return
  }

  await acceptPendingInvites(supabase, user)
  await loadHeader()

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  const lastPeriodEl = document.getElementById("lastPeriodStart")
  const periodLengthEl = document.getElementById("periodLength")
  const cycleLengthEl = document.getElementById("cycleLength")
  const emailEl = document.getElementById("emailInput")

  if (profile?.last_period_start) {
    lastPeriodEl.value = profile.last_period_start.split("T")[0]
  }
  if (profile?.period_length != null) {
    periodLengthEl.value = profile.period_length
  }
  if (profile?.cycle_length != null) {
    cycleLengthEl.value = profile.cycle_length
  }
  if (emailEl) {
    emailEl.value = user.email || ""
  }

  const profileMsg = document.getElementById("profileMsg")
  const emailMsg = document.getElementById("emailMsg")
  const passwordMsg = document.getElementById("passwordMsg")
  const deleteMsg = document.getElementById("deleteMsg")
  const sharingMsg = document.getElementById("sharingMsg")
  const partnerInvitesList = document.getElementById("partnerInvitesList")

  async function renderPartnerInvites() {
    if (!partnerInvitesList) return

    const invites = await listMyInvites(supabase, user)
    partnerInvitesList.innerHTML = ""

    if (!invites.length) {
      partnerInvitesList.innerHTML =
        '<p class="settings-desc">No partners invited yet.</p>'
      return
    }

    for (const invite of invites) {
      const row = document.createElement("div")
      row.className = "partner-invite-row"

      const statusLabel =
        invite.status === "accepted"
          ? "Accepted"
          : invite.status === "pending"
            ? "Pending"
            : invite.status

      row.innerHTML = `
        <div class="partner-invite-info">
          <span class="partner-invite-email">${invite.partner_email}</span>
          <span class="partner-invite-status partner-invite-status--${invite.status}">${statusLabel}</span>
        </div>
      `

      const revokeBtn = document.createElement("button")
      revokeBtn.type = "button"
      revokeBtn.className = "btn-revoke"
      revokeBtn.textContent = "Revoke"
      revokeBtn.addEventListener("click", async () => {
        if (!confirm(`Revoke access for ${invite.partner_email}?`)) return

        const { error: delError } = await supabase
          .from("partner_links")
          .delete()
          .eq("id", invite.id)

        if (delError) {
          showMsg(sharingMsg, delError.message, true)
          return
        }

        showMsg(sharingMsg, "Access revoked.", false)
        await renderPartnerInvites()
      })

      row.appendChild(revokeBtn)
      partnerInvitesList.appendChild(row)
    }
  }

  await renderPartnerInvites()

  document.getElementById("invitePartnerBtn")?.addEventListener("click", async () => {
    hideMsg(sharingMsg)

    const partnerEmail = document
      .getElementById("partnerEmailInput")
      ?.value.trim()
      .toLowerCase()

    if (!partnerEmail) {
      showMsg(sharingMsg, "Please enter your partner's email.", true)
      return
    }

    if (partnerEmail === (user.email || "").toLowerCase()) {
      showMsg(sharingMsg, "You cannot invite your own email.", true)
      return
    }

    const inviteBtn = document.getElementById("invitePartnerBtn")
    const originalLabel = inviteBtn?.textContent || "Invite partner"

    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession?.access_token) {
      showMsg(sharingMsg, "Session expired. Please log in again.", true)
      return
    }

    if (inviteBtn) {
      inviteBtn.disabled = true
      inviteBtn.textContent = "Sending..."
    }

    const baseUrl =
      window.SUPABASE_URL || "https://gixndvzewaizeqqluezu.supabase.co"
    const redirectTo = `${window.location.origin}/dashboard.html`

    try {
      const res = await fetch(`${baseUrl}/functions/v1/invite-partner`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          partner_email: partnerEmail,
          redirect_to: redirectTo
        })
      })

      let payload = null
      try {
        payload = await res.json()
      } catch {
        // non-JSON response
      }

      if (!res.ok) {
        showMsg(
          sharingMsg,
          payload?.error ||
            "Invite failed. Make sure the invite-partner function is deployed.",
          true
        )
        return
      }

      document.getElementById("partnerEmailInput").value = ""

      if (payload?.email_sent) {
        showMsg(
          sharingMsg,
          `Invite email sent to ${partnerEmail}. They can sign up using the link in that email.`,
          false
        )
      } else if (payload?.already_registered) {
        showMsg(
          sharingMsg,
          `${partnerEmail} already has a Bloom account. Tell them to log in — access will activate automatically.`,
          false
        )
      } else {
        showMsg(
          sharingMsg,
          "Invite saved, but the email could not be sent. Ask your partner to sign up with this email.",
          false
        )
      }

      await renderPartnerInvites()
    } catch (err) {
      showMsg(sharingMsg, err.message || "Network error.", true)
    } finally {
      if (inviteBtn) {
        inviteBtn.disabled = false
        inviteBtn.textContent = originalLabel
      }
    }
  })

  document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
    hideMsg(profileMsg)

    const last_period_start = lastPeriodEl.value
    const period_length = periodLengthEl.value
    const cycle_length = cycleLengthEl.value

    if (!last_period_start || !period_length || !cycle_length) {
      showMsg(profileMsg, "Please fill all cycle profile fields.", true)
      return
    }

    const { error } = await supabase.from("profiles").upsert([
      {
        id: user.id,
        last_period_start,
        period_length: Number(period_length),
        cycle_length: Number(cycle_length)
      }
    ])

    if (error) {
      showMsg(profileMsg, error.message, true)
      return
    }

    showMsg(profileMsg, "Profile saved. Open the dashboard to see updated predictions.")
  })

  document.getElementById("updateEmailBtn")?.addEventListener("click", async () => {
    hideMsg(emailMsg)

    const email = emailEl.value.trim()
    if (!email) {
      showMsg(emailMsg, "Please enter an email address.", true)
      return
    }

    const { error } = await supabase.auth.updateUser({ email })

    if (error) {
      showMsg(emailMsg, error.message, true)
      return
    }

    showMsg(
      emailMsg,
      "Check your inbox to confirm the new email address."
    )
  })

  document.getElementById("updatePasswordBtn")?.addEventListener("click", async () => {
    hideMsg(passwordMsg)

    const pwd = document.getElementById("newPassword").value
    const confirm = document.getElementById("confirmPassword").value

    if (pwd.length < 6) {
      showMsg(passwordMsg, "Password must be at least 6 characters.", true)
      return
    }

    if (pwd !== confirm) {
      showMsg(passwordMsg, "Passwords do not match.", true)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: pwd })

    if (error) {
      showMsg(passwordMsg, error.message, true)
      return
    }

    document.getElementById("newPassword").value = ""
    document.getElementById("confirmPassword").value = ""
    showMsg(passwordMsg, "Password updated successfully.")
  })

  const deleteModal = document.getElementById("deleteConfirmModal")
  const deleteInput = document.getElementById("deleteConfirmInput")
  const deleteYesBtn = document.getElementById("deleteConfirmYes")
  const deleteCancelBtn = document.getElementById("deleteConfirmCancel")
  const deleteCloseX = document.getElementById("deleteConfirmClose")

  function openDeleteModal() {
    hideMsg(deleteMsg)
    if (deleteInput) deleteInput.value = ""
    if (deleteYesBtn) deleteYesBtn.disabled = true
    deleteModal?.classList.remove("hidden")
    setTimeout(() => deleteInput?.focus(), 0)
  }

  function closeDeleteModal() {
    deleteModal?.classList.add("hidden")
  }

  deleteInput?.addEventListener("input", () => {
    if (!deleteYesBtn) return
    deleteYesBtn.disabled = deleteInput.value.trim() !== "DELETE"
  })

  deleteCancelBtn?.addEventListener("click", closeDeleteModal)
  deleteCloseX?.addEventListener("click", closeDeleteModal)

  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) closeDeleteModal()
  })

  document.getElementById("deleteAccountBtn")?.addEventListener("click", openDeleteModal)

  deleteYesBtn?.addEventListener("click", async () => {
    if (deleteInput?.value.trim() !== "DELETE") return

    deleteYesBtn.disabled = true
    deleteYesBtn.textContent = "Deleting..."

    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession?.access_token) {
      showMsg(deleteMsg, "Session expired. Please log in again.", true)
      deleteYesBtn.textContent = "Yes, delete my account"
      closeDeleteModal()
      return
    }

    const baseUrl = window.SUPABASE_URL || "https://gixndvzewaizeqqluezu.supabase.co"

    try {
      const res = await fetch(`${baseUrl}/functions/v1/delete-account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          "Content-Type": "application/json"
        }
      })

      if (!res.ok) {
        const text = await res.text()
        showMsg(
          deleteMsg,
          text || "Delete failed. Make sure the delete-account function is deployed.",
          true
        )
        deleteYesBtn.textContent = "Yes, delete my account"
        deleteYesBtn.disabled = false
        closeDeleteModal()
        return
      }

      await supabase.auth.signOut()
      window.location.href = "index.html"
    } catch (err) {
      showMsg(deleteMsg, err.message || "Network error.", true)
      deleteYesBtn.textContent = "Yes, delete my account"
      deleteYesBtn.disabled = false
      closeDeleteModal()
    }
  })
}

initSettings().catch(console.error)
