document.addEventListener('DOMContentLoaded', function() {
  // Add JS-ready class when JavaScript is available
  document.documentElement.classList.add('js-ready');

  const customerTypeRadios = document.querySelectorAll('input[name="customer_type"]');
  const localForm = document.getElementById('local-customer-form');
  const foreignForm = document.getElementById('foreign-customer-form');
  
  customerTypeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.value === 'local') {
        localForm.style.display = 'block';
        foreignForm.style.display = 'none';
      } else {
        localForm.style.display = 'none';
        foreignForm.style.display = 'block';
      }
    });
  });
  
  // Initialize birthdate picker
  document.querySelectorAll('[type="date"]').forEach(dateInput => {
    dateInput.addEventListener('click', function() {
      this.showPicker();
    });
  });
  
  // Format Philippine phone number input
  const phPhoneInput = document.getElementById('RegisterForm-contactN');
  if (phPhoneInput) {
    phPhoneInput.addEventListener('input', function(e) {
      this.value = this.value.replace(/[^0-9]+/g, '');
    });
  }
});