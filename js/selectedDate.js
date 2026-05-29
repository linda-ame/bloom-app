let selectedDateKey = new Date().toISOString().split("T")[0]

export function getSelectedDate() {
  return selectedDateKey
}

export function setSelectedDate(dateKey) {
  selectedDateKey = dateKey
}
