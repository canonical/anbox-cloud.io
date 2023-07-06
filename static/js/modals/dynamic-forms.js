import setupIntlTelInput from "./intlTelInput.js";

(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var triggeringHash = "#get-in-touch";
    var formContainer = document.getElementById("contact-form-container");
    var contactButtons = document.querySelectorAll(".js-invoke-modal");
    const contactModalSelector = "contact-modal";

    contactButtons.forEach(function (contactButton) {
      contactButton.addEventListener("click", function (e) {
        e.preventDefault();
        if (contactButton.dataset.formLocation) {
          fetchForm(contactButton.dataset, contactButton);
        } else {
          fetchForm(formContainer.dataset);
        }
        open();
      });
    });

    // Fetch, load and initialise form
    function fetchForm(formData, contactButton) {
      fetch(formData.formLocation)
        .then(function (response) {
          return response.text();
        })
        .then(function (text) {
          formContainer.classList.remove("u-hide");
          formContainer.innerHTML = text
            .replace(/%% formid %%/g, formData.formId)
            .replace(/%% returnURL %%/g, formData.returnUrl);

          if (formData.title) {
            const title = document.getElementById("modal-title");
            title.innerHTML = formData.title;
          }
          initialiseForm();
          setFocus();
        })
        .catch(function (error) {
          console.log("Request failed", error);
        });
    }

    // Open the contact us modal
    function open() {
      updateHash(triggeringHash);
    }

    // Removes the triggering hash
    function updateHash(hash) {
      var location = window.location;
      if (location.hash !== hash || hash === "") {
        if ("pushState" in history) {
          history.pushState(
            "",
            document.title,
            location.pathname + location.search + hash
          );
        } else {
          location.hash = hash;
        }
      }
    }

    function initialiseForm() {
      var contactIndex = 1;
      const contactModal = document.getElementById(contactModalSelector);
      var closeModal = document.querySelector(".p-modal__close");
      var closeModalButton = document.querySelector(".js-close");
      var phoneInput = document.querySelector("#phone");
      var modalTrigger = document.activeElement || document.body;

      document.onkeydown = function (evt) {
        evt = evt || window.event;
        if (evt.keyCode == 27) {
          close();
        }
      };

      if (closeModal) {
        closeModal.addEventListener("click", function (e) {
          e.preventDefault();
          close();
        });
      }

      if (closeModalButton) {
        closeModalButton.addEventListener("click", function (e) {
          e.preventDefault();
          close();
        });
      }

      if (contactModal) {
        let isClickStartedInside = false;
        contactModal.addEventListener("mousedown", function (e) {
          isClickStartedInside = e.target.id !== contactModalSelector;
        });
        contactModal.addEventListener("mouseup", function (e) {
          if (!isClickStartedInside && e.target.id === contactModalSelector) {
            e.preventDefault();
            close();
          }
        });
      }

      // Updates the index and renders the changes
      function setState(index) {
        contactIndex = index;
      }

      // Close the modal and set the index back to the first stage
      function close() {
        setState(1);
        formContainer.classList.add("u-hide");
        formContainer.removeChild(contactModal);
        modalTrigger.focus();
        updateHash("");
      }

      // Setup dial code dropdown options (intlTelInput.js)
      setupIntlTelInput(phoneInput);

      function fireLoadedEvent() {
        var event = new CustomEvent("contactModalLoaded");
        document.dispatchEvent(event);
      }

      fireLoadedEvent();
    }

    // Sets the focus inside the modal and trap it
    function setFocus() {
      var modal = document.querySelector(".p-modal");
      var firstFocusableEle = modal.querySelector(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );

      // set initial focus inside the modal
      firstFocusableEle.focus();

      // trap focus
      firstFocusableEle.addEventListener("keydown", function (e) {
        if (e.shiftKey && e.key === "Tab") {
          e.preventDefault();
          var targetPage = modal.querySelector(".js-pagination:not(.u-hide)");
          var targetEle = targetPage.querySelector(".pagination__link--next");
          targetEle.focus();
        }
      });
    }

    // Opens the form when the initial hash matches the trigger
    if (window.location.hash === triggeringHash) {
      fetchForm(formContainer.dataset);
      open();
    }

    // Listens for hash changes and opens the form if it matches the trigger
    function locationHashChanged() {
      if (window.location.hash === triggeringHash) {
        fetchForm(formContainer.dataset);
        open();
      }
    }
    window.onhashchange = locationHashChanged;
  });
})();
