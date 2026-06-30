'use strict';

// Runs in the Etherpad pad page after ACE initialises.
// Attaches a paste listener to the ACE inner document and sends a postMessage
// to the wrapper shell (window.parent) when a real paste gesture is detected.
// Uses the `paste` DOM event rather than beforeinput/input so that Chinese IME
// insertions (which some browsers report as insertFromPaste) are not flagged.
exports.postAceInit = function (hookName, context, callback) {
  var MIN_PASTE_CHARS = 5; // ignore tiny inserts (autocomplete, emoji pickers)

  function attachListeners(innerDoc) {
    innerDoc.addEventListener('paste', function (evt) {
      var text = '';
      try {
        var cd = evt.clipboardData || (typeof window !== 'undefined' && window.clipboardData);
        if (cd) text = cd.getData('text/plain') || '';
      } catch (_) {}
      var len = text.length;
      if (len < MIN_PASTE_CHARS) return;
      window.parent.postMessage({
        type: 'ih_paste_event',
        inputType: 'insertFromPaste',
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
