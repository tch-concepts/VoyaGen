/**
 * VoyaGen Donation Module (GitHub Sponsors Version)
 * Handles UI interactions for opening and closing the donation information modal.
 */

/**
 * Opens the donation modal with smooth transitions
 */
function openDonateModal() {
  const modal = document.getElementById('donate-modal');
  const card = document.getElementById('donate-modal-card');
  if (!modal || !card) return;

  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('opacity-100');
    card.classList.remove('opacity-0', 'scale-95');
    card.classList.add('opacity-100', 'scale-100');
  });
}

/**
 * Closes the donation modal with smooth transitions
 */
function closeDonateModal() {
  const modal = document.getElementById('donate-modal');
  const card = document.getElementById('donate-modal-card');
  if (!modal || !card) return;

  card.classList.remove('opacity-100', 'scale-100');
  card.classList.add('opacity-0', 'scale-95');
  
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('opacity-100');
  }, 300);
}

// Attach functions to the window scope for HTML inline handlers
window.openDonateModal = openDonateModal;
window.closeDonateModal = closeDonateModal;
