document
  .querySelector('#print')
  .addEventListener('click', () => window.print());
document.querySelector('#delete').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const error = document.querySelector('#delete-error');
  button.disabled = true;
  error.textContent = '';
  try {
    const response = await fetch(`/api/recipes/${button.dataset.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error((await response.json()).message);
    window.location.assign('/');
  } catch (reason) {
    error.textContent = reason.message || 'Unable to delete. Please try again.';
    button.disabled = false;
  }
});
