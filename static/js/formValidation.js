/**
* Handler for a form submit event
* to disable the normal submit, and instead use backgroundSubmit
*/

import serialize from '../third-party/serialize';

const backgroundSubmitHandlerClosure = function () {
  return function (submitEvent) {
    // Prevent normal submit
    submitEvent.preventDefault
      ? submitEvent.preventDefault()
      : (submitEvent.returnValue = false);
    // get form
    var marketoForm = document.getElementById(submitEvent.target.id);

    // Change the form's action location
    marketoForm.action = 'https://ubuntu.com/marketo/submit';

    // Submit the form in the background
    backgroundSubmit(marketoForm);
  };
};

const backgroundSubmit = function(marketoForm, submitCallback) {
  var request = new XMLHttpRequest();
  var submitUrl = marketoForm.getAttribute('action');
  var formData = serialize(marketoForm);

  request.open("POST", submitUrl, true);

  //Send the proper header information along with the request
  request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");

  // When request has finished, call the callback function
  if (submitCallback) {
    request.addEventListener(
    'readystatechange',
    function() {
      if (this.readyState == 4) {
        // Pass context and arguments on to submitCallback
        submitCallback.apply(this, arguments);
      }
    });
  }

  // Send off the POST request
  request.send(formData);

  // get the download asset if it exists
  var download_asset_url = marketoForm.querySelector('input[name=download_asset_url]');
  if (download_asset_url != null) {
    download_asset_url = download_asset_url.value;
  }

  // get the return url if it exists to redirect users after
  var return_url = marketoForm.querySelector('input[name=return_url]');
  if (return_url != null) {
    return_url = return_url.value;
  }

  // check if it is a dynamic modal form
  var isModal = marketoForm.classList.contains("modal-form");

  // check if it is a whitepaper
  var isWhitepaper = marketoForm.classList.contains("whitepaper-form");

  // check if there is a thank you message to post
  var thankYouMessage = marketoForm.querySelector('input[name=thankyoumessage]');
  if (thankYouMessage != null) {
    thankYouMessage = thankYouMessage.value;
  }
 

  // reset form and captcha
  if (!document.querySelector('.js-feedback-notification')) {
    marketoForm.reset();
  }

  // deal with the post submit actions
  afterSubmit(download_asset_url, return_url, isModal, thankYouMessage, marketoForm, isWhitepaper);

  return true;
}

/**
* After submit has happened
* start download and send the user to the instructions page
*/

const afterSubmit = function(download_asset_url, return_url, isModal, thankYouMessage, marketoForm, isWhitepaper) {

  // Now start the download
  if (download_asset_url) {
    var downloadFrame = document.createElement("iframe");
    downloadFrame.setAttribute("src", download_asset_url);
    downloadFrame.style.width = 0 + "px";
    downloadFrame.style.height = 0 + "px";
    document.body.insertBefore(downloadFrame, document.body.childNodes[0]);
  }

  // And redirect to the instructions page
  if (return_url) {
    window.setTimeout(function() {
      window.location.href = return_url;
    }, 1000);
  }

  // dynamic thank you HACK
  if (isModal) {
    document.getElementsByClassName('js-pagination--3')[0].classList.add("u-hide");
    document.getElementsByClassName('js-pagination--4')[0].classList.remove("u-hide");
  }

  // add a thank-you notification to the page
  // if someone submitted a form without a thank you action
  if (return_url === null && isModal === false && isWhitepaper === false) {
    if (thankYouMessage === null) {
      thankYouMessage =
        'Thank you<br />A member of our team will be in touch within one working day';
    }
    var feedbackArea = document.querySelector('.js-feedback-notification');
    if (feedbackArea) {
      feedbackArea.innerHTML =
        '<div class="p-notification--positive"><p class="p-notification__response">' +
        thankYouMessage +
        '</p></div>';
      var inputs = marketoForm.querySelectorAll('input, button');
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].disabled = 'disabled';
      }

      marketoForm.style.opacity = '.5';
    } else {
      document
        .getElementById('main-content')
        .insertAdjacentHTML(
          'afterbegin',
          '<div class="p-strip is-shallow u-no-padding--bottom"><div class="row"><div class="p-notification--positive"><p class="p-notification__response">' +
            thankYouMessage +
            '</p></div></div></div>'
        );
      window.scrollTo(0, 0);
    }
  }

  if (isWhitepaper) {
    whitepaperAfterSubmit();
  }
}

// attach handler to all forms
let marketoForm = document.querySelectorAll("form[id^=mktoForm]");
marketoForm.forEach(function(form) {
  form.addEventListener('submit', backgroundSubmitHandlerClosure())
});