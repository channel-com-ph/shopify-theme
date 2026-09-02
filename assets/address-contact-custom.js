var contactObject = {
  "+63": "Philippines" // You can add more country codes here
};

var countryCode = document.getElementById("countryCode");
var addressCountry = document.getElementById("addressCountry");


for (var code in contactObject) {
  countryCode.appendChild(new Option(code, code));
}

countryCode.onchange = function() {
  if (this.value && contactObject[this.value]) {
    addressCountry.textContent = contactObject[this.value];
  } else {
    addressCountry.textContent = "";
  }
};

var countryCodeC = document.getElementById("countryCodeC");
var addressCountryC = document.getElementById("addressCountryC");


for (var codeC in contactObject) {
  console.log(contactObject); // Log the correct variable
  countryCodeC.appendChild(new Option(codeC, codeC));
}

countryCodeC.onchange = function() {
  if (this.value && contactObject[this.value]) {
    addressCountryC.textContent = contactObject[this.value];
  } else {
    addressCountryC.textContent = "";
  }
};