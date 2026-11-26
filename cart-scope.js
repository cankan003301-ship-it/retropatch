/* Keep the browser cart separate for every Firebase account. */
(function () {
  'use strict';

  if (window.__rpCartScopeInstalled || !window.Storage) return;
  window.__rpCartScopeInstalled = true;

  var CART_KEY = 'retropatch_cart';
  var USER_CART_PREFIX = CART_KEY + '_user_';
  var PENDING_KEY = CART_KEY + '_auth_pending';
  var LEGACY_ARCHIVE_KEY = CART_KEY + '_unassigned_v1';
  var MIGRATION_MARKER_KEY = CART_KEY + '_scope_v1_migrated';
  var storageProto = window.Storage.prototype;
  var nativeGet = storageProto.getItem;
  var nativeSet = storageProto.setItem;
  var nativeRemove = storageProto.removeItem;
  var authReady = false;
  var activeUid = null;

  function scopedKey(storage, key) {
    if (key !== CART_KEY) return key;
    try {
      if (storage !== window.localStorage) return key;
    } catch (e) {
      return key;
    }
    if (!authReady) return PENDING_KEY;
    return activeUid ? USER_CART_PREFIX + activeUid : CART_KEY;
  }

  storageProto.getItem = function (key) {
    return nativeGet.call(this, scopedKey(this, key));
  };
  storageProto.setItem = function (key, value) {
    return nativeSet.call(this, scopedKey(this, key), value);
  };
  storageProto.removeItem = function (key) {
    return nativeRemove.call(this, scopedKey(this, key));
  };

  function readCart(value) {
    try {
      var cart = JSON.parse(value || '[]');
      return Array.isArray(cart) ? cart : [];
    } catch (e) {
      return [];
    }
  }

  function mergePendingCart(target, pending) {
    var current = readCart(target);
    var queued = readCart(pending);
    queued.forEach(function (item) {
      var found = current.find(function (existing) {
        return existing.id === item.id &&
          (existing.backType || existing.back || '') === (item.backType || item.back || '') &&
          (existing.size || '') === (item.size || '') &&
          !!existing.digital === !!item.digital;
      });
      if (found) {
        if (!found.digital) found.qty = Math.min(99, (Number(found.qty) || 1) + (Number(item.qty) || 1));
      } else {
        current.push(item);
      }
    });
    return JSON.stringify(current);
  }

  function archiveUnassignedCart() {
    try {
      var storage = window.localStorage;
      if (nativeGet.call(storage, MIGRATION_MARKER_KEY) === '1') return;
      var legacy = nativeGet.call(storage, CART_KEY);
      if (legacy && legacy !== '[]') {
        if (!nativeGet.call(storage, LEGACY_ARCHIVE_KEY)) {
          nativeSet.call(storage, LEGACY_ARCHIVE_KEY, legacy);
        }
        nativeRemove.call(storage, CART_KEY);
      }
      nativeSet.call(storage, MIGRATION_MARKER_KEY, '1');
    } catch (e) {}
  }

  function refreshCartUI() {
    try {
      window.dispatchEvent(new CustomEvent('rp:cart-scope-ready', { detail: { uid: activeUid } }));
    } catch (e) {}
    try {
      if (typeof window.updateCartCount === 'function') window.updateCartCount();
      if (typeof window.syncBasket === 'function') window.syncBasket();
      if (/\/sepet\.html$/i.test(window.location.pathname) && typeof window.loadCart === 'function') window.loadCart();
    } catch (e) {}
  }

  function startAuthListener() {
    try {
      if (!window.firebase || !firebase.auth || !firebase.apps || !firebase.apps.length) {
        window.setTimeout(startAuthListener, 100);
        return;
      }
      firebase.auth().onAuthStateChanged(function (user) {
        activeUid = user && user.uid ? user.uid : null;
        authReady = true;

        if (activeUid) archiveUnassignedCart();

        try {
          var pending = nativeGet.call(window.localStorage, PENDING_KEY);
          if (pending) {
            var destination = activeUid ? USER_CART_PREFIX + activeUid : CART_KEY;
            var existing = nativeGet.call(window.localStorage, destination);
            nativeSet.call(window.localStorage, destination, mergePendingCart(existing, pending));
            nativeRemove.call(window.localStorage, PENDING_KEY);
          }
        } catch (e) {}

        refreshCartUI();
      });
    } catch (e) {
      window.setTimeout(startAuthListener, 100);
    }
  }

  startAuthListener();
})();
