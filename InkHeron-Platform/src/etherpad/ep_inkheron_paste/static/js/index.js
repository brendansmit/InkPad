'use strict';

// Runs in the Etherpad pad page after ACE initialises.
// Attaches a beforeinput/input listener pair to the ACE inner document
// and sends a postMessage to the wrapper shell (window.parent) when a
// paste event is detected. The shell handles the API call — the plugin
// deliberately has no knowledge of auth or pad IDs.
exports.postAceInit = function (hookName, context, callback) {
  var MIN_PASTE_CHARS = 5; // ignore tiny inserts (autocomplete, emoji pickers)
  var pendingLength = 0;

  function attachListeners(innerDoc) {
    // beforeinput fires before the DOM changes — dataTransfer has the paste text
    innerDoc.addEventListener('beforeinput', function (evt) {
      if (evt.inputType !== 'insertFromPaste') return;
      try {
        var text = evt.dataTransfer ? evt.dataTransfer.getData('text/plain') : '';
        pendingLength = text ? text.length : 0;
      } catch (_) {
        pendingLength = 0;
      }
    }, { passive: true });

    // input fires after the DOM changes — confirm the paste went through
    innerDoc.addEventListener('input', function (evt) {
      if (evt.inputType !== 'insertFromPaste') return;
      var len = pendingLength;
      pendingLength = 0;
      if (len < MIN_PASTE_CHARS) return;
      window.parent.postMessage({
        type: 'ih_paste_event',
        inputType: evt.inputType,
        length: len,
        at: Date.now(),
      }, window.location.origin || '*');
    });
  }

  function getInnerDoc() {
    try {
      var outerFrame = document.querySelector('iframe[name="ace_outer"]');
      if (!outerFrame || !outerFrame.contentDocument) return null;
      var innerFrame = outerFrame.contentDocument.querySelector('iframe[name="ace_inner"]');
      if (!innerFrame || !innerFrame.contentDocument) return null;
      return innerFrame.contentDocument;
    } catch (_) {
      return null;
    }
  }

  var attempts = 0;
  function tryAttach() {
    var innerDoc = getInnerDoc();
    if (innerDoc) {
      attachListeners(innerDoc);
      return;
    }
    if (++attempts < 25) setTimeout(tryAttach, 300);
  }
  tryAttach();

  callback();
};
