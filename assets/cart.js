class CartRemoveButton extends HTMLElement {
  constructor() {

    super();
    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0);

    });

  }

}



customElements.define('cart-remove-button', CartRemoveButton);



class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, 300);
    this.addEventListener('change', debouncedOnChange.bind(this));

    this.addEventListener('change', (event) => {
      if (event.target.classList.contains('cart-item-selector')) {
        this.updateEstimatedTotal();
      }
    });
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate();
    });
    
    this.checkoutButton = document.getElementById('custom-checkout-button');
    if (this.checkoutButton) {
      this.boundHandleCheckout = this.handleCheckout.bind(this);
      this.checkoutButton.addEventListener('click', this.boundHandleCheckout);
    }
    
    // NEW: Check for and restore saved items every time the cart page loads.
    this.restoreSavedItems();

    this.updateEstimatedTotal();
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
    if (this.checkoutButton && this.boundHandleCheckout) {
      this.checkoutButton.removeEventListener('click', this.boundHandleCheckout);
    }
  }

  /**
   * NEW: This function checks browser memory for items that were unselected
   * during a previous checkout and adds them back to the cart.
   */
  async restoreSavedItems() {
    const savedItemsJSON = sessionStorage.getItem('savedForLater');
    if (!savedItemsJSON) return;

    const savedItems = JSON.parse(savedItemsJSON);
    if (savedItems.length === 0) return;

    // Immediately clear the saved items from memory to prevent re-adding them.
    sessionStorage.removeItem('savedForLater');
    
    this.enableLoading(); // Show loading spinner for the whole cart
    
    const updates = {};
    savedItems.forEach(item => {
      updates[item.id] = item.quantity;
    });

    try {
      await fetch(`${routes.cart_update_url}`, {
        ...fetchConfig(),
        body: JSON.stringify({ updates })
      });
      // The cart will automatically re-render via onCartUpdate
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-restored' });
    } catch (e) {
      console.error("Could not restore saved items:", e);
      this.disableLoading();
    }
  }
  
  /**
   * REVISED: This function now uses the AJAX API to save and remove unselected items
   * before redirecting to the standard checkout page.
   */
  async handleCheckout(event) {
    event.preventDefault();
    const checkoutButton = event.currentTarget;
    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Processing...';

    const itemsToSave = [];
    // Find all UNCHECKED items to save them.
    this.querySelectorAll('.cart-item-selector:not(:checked)').forEach(checkbox => {
      const cartItem = checkbox.closest('.cart-item');
      itemsToSave.push({
        id: cartItem.dataset.variantId,
        quantity: parseInt(cartItem.querySelector('input[name="updates[]"]').value, 10)
      });
    });
    
    const selectedItemCount = this.querySelectorAll('.cart-item-selector:checked').length;
    if (selectedItemCount === 0) {
      alert('Please select items to proceed to checkout.');
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Checkout';
      return;
    }

    // Save the unselected items to the browser's session memory.
    sessionStorage.setItem('savedForLater', JSON.stringify(itemsToSave));

    // Prepare to remove the unselected items from the cart.
    const updates = {};
    itemsToSave.forEach(item => {
      updates[item.id] = 0; // Setting quantity to 0 removes the item.
    });
    
    try {
      if (itemsToSave.length > 0) {
        // If there are items to remove, update the cart.
        await fetch(`${routes.cart_update_url}`, {
          ...fetchConfig(),
          body: JSON.stringify({ updates })
        });
      }
      // Once the cart is updated, redirect to the standard checkout.
      window.location.href = routes.cart_url.replace('/cart', '/checkout');
    } catch (e) {
      console.error("Could not update cart before checkout:", e);
      // If something fails, remove saved items so we don't restore incorrectly.
      sessionStorage.removeItem('savedForLater');
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Checkout';
      alert('There was an error preparing your cart. Please try again.');
    }
  }

  updateEstimatedTotal() {
    let total = 0;
    this.querySelectorAll('.cart-item-selector:checked').forEach(checkbox => {
      const cartItem = checkbox.closest('.cart-item');
      const linePrice = parseInt(cartItem.dataset.linePrice, 10);
      if (!isNaN(linePrice)) {
        total += linePrice;
      }
    });

    const totalElement = document.getElementById('custom-cart-total');
    if (totalElement) {
      totalElement.innerHTML = this.formatMoney(total);
    }
  }
  
  formatMoney(cents) {
    let formatString = '₱{{amount}} PHP';
    if (window.Shopify && window.Shopify.money_format) {
      formatString = window.Shopify.money_format;
    }
    if (typeof cents === 'string') {
      cents = cents.replace('.', '');
    }
    function formatWithDelimiters(number, precision = 2, thousands = ',', decimal = '.') {
      if (isNaN(number) || number == null) { return 0; }
      const numberFixed = (number / 100.0).toFixed(precision);
      const parts = numberFixed.split('.');
      const dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
      return dollars + (parts[1] ? decimal + parts[1] : '');
    }
    const amount = formatWithDelimiters(cents);
    return formatString.replace(/\{\{\s*amount\s*\}\}/, amount);
  }

  onChange(event) {
    if (!event.target.matches('input[name="updates[]"]')) return;
    this.updateQuantity(
      event.target.dataset.index,
      parseInt(event.target.value),
    );
  }

  onCartUpdate() {
    fetch(`${routes.cart_url}?section_id=main-cart-items`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const sourceQty = html.querySelector('cart-items');
        this.innerHTML = sourceQty.innerHTML;
        this.updateEstimatedTotal();
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        this.disableLoading();
      });
  }

  updateQuantity(line, quantity) {
    this.enableLoading(line);
    const body = JSON.stringify({
      line,
      quantity,
      sections: ['main-cart-items', 'cart-icon-bubble', 'main-cart-footer'],
      sections_url: window.location.pathname,
    });
    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => response.text())
      .then((state) => {
        const parsedState = JSON.parse(state);
        this.classList.toggle('is-empty', parsedState.item_count === 0);
        document.getElementById('main-cart-footer')?.classList.toggle('is-empty', parsedState.item_count === 0);
        this.onCartUpdate(); // Trigger a full re-render and price update
        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items' });
      })
      .catch(() => {
        alert('There was an error while updating your cart. Please try again.');
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }
  
  enableLoading(line) {
    const cartItemsEl = document.getElementById('main-cart-items');
    if (cartItemsEl) cartItemsEl.classList.add('cart__items--disabled');
    if (line) {
      this.querySelectorAll(`#CartItem-${line} .loading-overlay`).forEach((overlay) => overlay.classList.remove('hidden'));
    }
  }

  disableLoading(line) {
    const cartItemsEl = document.getElementById('main-cart-items');
    if (cartItemsEl) cartItemsEl.classList.remove('cart__items--disabled');
     if (line) {
      this.querySelectorAll(`#CartItem-${line} .loading-overlay`).forEach((overlay) => overlay.classList.add('hidden'));
    }
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {

  customElements.define(

    'cart-note',

    class CartNote extends HTMLElement {

      constructor() {

        super();



        this.addEventListener(

          'input',

          debounce((event) => {

            const body = JSON.stringify({ note: event.target.value });

            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });

          }, ON_CHANGE_DEBOUNCE_TIMER)

        );

      }

    }

  );

}