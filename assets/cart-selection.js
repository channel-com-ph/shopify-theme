document.addEventListener('DOMContentLoaded', () => {
  const cartItemsContainer = document.getElementById('main-cart-items');
  if (!cartItemsContainer) return; // Exit if not on the cart page

  const checkoutButton = document.getElementById('checkout');
  const subtotalElement = document.getElementById('selective-subtotal');
  const cartForm = document.getElementById('cart');

 
  const restoreSavedItems = async () => {
    const savedItemsRaw = localStorage.getItem('savedForLater');
    if (!savedItemsRaw) return;

    const savedItems = JSON.parse(savedItemsRaw);

    if (savedItems && savedItems.length > 0) {
      if(checkoutButton) checkoutButton.disabled = true;

      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: savedItems }),
      });

      localStorage.removeItem('savedForLater');
      window.location.reload();
    }
  };

  /**
   * This function updates the subtotal display based on which items are checked.
   * It no longer creates a permalink.
   */
  const updateCartState = () => {
    const checkboxes = document.querySelectorAll('.cart-item-checkbox');
    let newSubtotal = 0;
    let selectedItemCount = 0;

    checkboxes.forEach(checkbox => {
      const cartItemRow = checkbox.closest('.cart-item');
      if (!cartItemRow) return;

      const quantityInput = cartItemRow.querySelector('.quantity__input');
      const currentQuantity = parseInt(quantityInput.value, 10);

      if (checkbox.checked) {
        const price = parseFloat(checkbox.dataset.price);
        newSubtotal += price * currentQuantity;
        selectedItemCount++;
      }
    });

    // Update subtotal display
    if (subtotalElement) {
      const formattedSubtotal = new Intl.NumberFormat(document.documentElement.lang, {
        style: 'currency',
        currency: window.Shopify?.currency?.active || 'USD',
      }).format(newSubtotal / 100);
      subtotalElement.textContent = formattedSubtotal;
    }

    // Enable or disable the checkout button
    if (checkoutButton) {
      checkoutButton.disabled = selectedItemCount === 0;
    }
  };

const handleCheckout = (event) => {
  event.preventDefault(); 
  event.stopImmediatePropagation(); 

  checkoutButton.disabled = true; 
  checkoutButton.textContent = 'Processing...';

  const checkboxes = document.querySelectorAll('.cart-item-checkbox');
  const itemsToSave = [];
  const updates = {}; 
  checkboxes.forEach(checkbox => {
    if (!checkbox.checked) {
      const variantId = checkbox.dataset.variantId;
      const cartItemRow = checkbox.closest('.cart-item');
      const quantityInput = cartItemRow.querySelector('.quantity__input');
      const quantity = parseInt(quantityInput.value, 10);

      if (variantId && quantity > 0) {
        itemsToSave.push({ id: variantId, quantity: quantity });
        updates[variantId] = 0;
      }
    }
  });

  if (itemsToSave.length > 0) {
    localStorage.setItem('savedForLater', JSON.stringify(itemsToSave));
  }

  if (Object.keys(updates).length > 0) {
    const data = JSON.stringify({ updates: updates });
    const blob = new Blob([data], { type: 'application/json' });
    navigator.sendBeacon('/cart/update.js', blob);
  }

  window.location.href = '/checkout';
};

  if (checkoutButton && cartForm) {
      cartForm.addEventListener('submit', handleCheckout);
  }

  const attachListeners = () => {

    document.querySelectorAll('.cart-item-checkbox').forEach(checkbox => {
      checkbox.removeEventListener('change', updateCartState);
      checkbox.addEventListener('change', updateCartState);
    });
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        attachListeners();
        updateCartState();
        break;
      }
    }
  });

  observer.observe(cartItemsContainer, { childList: true, subtree: true });


  restoreSavedItems().then(() => {
    attachListeners();
    updateCartState();
  });
});