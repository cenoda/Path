(function () {
  function getInitial(value) {
    return String(value || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function createProfileEditor(options) {
    var opts = options || {};
    var elements = opts.elements || {};
    var pendingImageFile = null;
    var searchTimer = null;
    var isBound = false;
    var saveButtonDefaultText = opts.saveButtonText || (elements.saveButton ? String(elements.saveButton.textContent || '').trim() : '') || '저장';

    function getUser() {
      return typeof opts.getUser === 'function' ? opts.getUser() : null;
    }

    function applyUser(nextUser) {
      if (typeof opts.applyUser === 'function') {
        opts.applyUser(nextUser);
      }
    }

    function setLoggedInState(isLoggedIn) {
      if (typeof opts.setLoggedInState === 'function') {
        opts.setLoggedInState(!!isLoggedIn);
      }
    }

    function setError(message) {
      if (!elements.errorElement) return;
      elements.errorElement.textContent = String(message || '').trim();
    }

    function setPrevVisibility() {
      if (!elements.nsuInput || !elements.prevWrap) return;
      elements.prevWrap.classList.toggle('hidden', !elements.nsuInput.checked);
    }

    function hideUniversityResults() {
      [elements.univResults, elements.prevUnivResults].forEach(function (node) {
        if (node) node.classList.add('hidden');
      });
    }

    function setAvatarPreview(imageUrl, nickname) {
      if (!elements.avatarPreview) return;
      elements.avatarPreview.innerHTML = '';

      var safeUrl = String(imageUrl || '').trim();
      if (safeUrl) {
        var image = document.createElement('img');
        image.src = safeUrl;
        image.alt = opts.avatarAlt || '프로필';
        if (opts.avatarImageClass) image.className = opts.avatarImageClass;
        elements.avatarPreview.appendChild(image);
        return;
      }

      elements.avatarPreview.textContent = getInitial(nickname);
    }

    function renderUniversityResults(items, targetInput, resultsEl) {
      if (!resultsEl || !targetInput) return;
      resultsEl.innerHTML = '';

      var list = Array.isArray(items) ? items : [];
      if (!list.length) {
        resultsEl.classList.add('hidden');
        return;
      }

      list.forEach(function (item) {
        var button = document.createElement('button');
        var name = String((item && item.name) || '');
        var region = String((item && item.region) || '');
        var nameSpan = document.createElement('span');
        var regionSpan = document.createElement('span');

        button.type = 'button';
        if (opts.universityItemClass) button.className = opts.universityItemClass;

        nameSpan.textContent = name;
        regionSpan.textContent = region ? '(' + region + ')' : '';
        if (opts.universityRegionClass) regionSpan.className = opts.universityRegionClass;

        button.appendChild(nameSpan);
        button.appendChild(regionSpan);
        button.addEventListener('click', function () {
          targetInput.value = name;
          resultsEl.classList.add('hidden');
        });

        resultsEl.appendChild(button);
      });

      resultsEl.classList.remove('hidden');
    }

    function searchUniversity(keyword, targetInput, resultsEl) {
      var query = String(keyword || '').trim();
      if (searchTimer) window.clearTimeout(searchTimer);

      if (!query) {
        if (resultsEl) resultsEl.classList.add('hidden');
        return;
      }

      searchTimer = window.setTimeout(function () {
        fetch('/api/university/search?q=' + encodeURIComponent(query), { credentials: 'include' })
          .then(function (response) {
            return response.ok ? response.json().catch(function () { return {}; }) : {};
          })
          .then(function (data) {
            renderUniversityResults(data && data.results ? data.results : [], targetInput, resultsEl);
          })
          .catch(function () {
            if (resultsEl) resultsEl.classList.add('hidden');
          });
      }, typeof opts.searchDelay === 'number' ? opts.searchDelay : 180);
    }

    function syncFromUser() {
      var user = getUser();
      var isLoggedIn = !!user;

      setLoggedInState(isLoggedIn);

      if (!isLoggedIn) {
        pendingImageFile = null;
        if (elements.photoInput) elements.photoInput.value = '';
        setError('');
        hideUniversityResults();
        return;
      }

      pendingImageFile = null;
      if (elements.photoInput) elements.photoInput.value = '';

      if (elements.nicknameInput) elements.nicknameInput.value = String(user.nickname || '');
      if (elements.universityInput) elements.universityInput.value = String(user.university || '');
      if (elements.prevUniversityInput) elements.prevUniversityInput.value = String(user.prev_university || '');
      if (elements.nsuInput) elements.nsuInput.checked = !!user.is_n_su;
      if (elements.allowFriendInput) elements.allowFriendInput.checked = !(user.allow_friend_requests === false);

      setPrevVisibility();
      hideUniversityResults();
      setAvatarPreview(user.profile_image_url || '', user.nickname || '?');
      setError('');
    }

    async function save() {
      var user = getUser();
      if (!user) {
        setError(opts.loginRequiredMessage || '로그인 후 프로필을 수정할 수 있어요.');
        return false;
      }

      var nickname = String(elements.nicknameInput && elements.nicknameInput.value || '').trim();
      var university = String(elements.universityInput && elements.universityInput.value || '').trim();
      var isNsu = !!(elements.nsuInput && elements.nsuInput.checked);
      var prevUniversity = String(elements.prevUniversityInput && elements.prevUniversityInput.value || '').trim();
      var allowFriendRequests = !!(elements.allowFriendInput && elements.allowFriendInput.checked);

      if (!nickname) {
        setError(opts.nicknameRequiredMessage || '닉네임을 입력해 주세요.');
        return false;
      }
      if (!university) {
        setError(opts.universityRequiredMessage || '목표 대학교를 입력해 주세요.');
        return false;
      }
      if (isNsu && !prevUniversity) {
        setError(opts.prevUniversityRequiredMessage || 'N수생은 전적 대학교를 입력해 주세요.');
        return false;
      }

      var hasProfileUpdate = (
        nickname !== String(user.nickname || '').trim() ||
        university !== String(user.university || '').trim() ||
        isNsu !== !!user.is_n_su ||
        prevUniversity !== String(user.prev_university || '').trim() ||
        !!pendingImageFile
      );
      var hasFriendSettingUpdate = allowFriendRequests !== !(user.allow_friend_requests === false);

      if (!hasProfileUpdate && !hasFriendSettingUpdate) {
        setError('');
        if (typeof opts.onNoChanges === 'function') {
          await opts.onNoChanges();
        }
        return false;
      }

      setError('');
      if (elements.saveButton) {
        elements.saveButton.disabled = true;
        elements.saveButton.textContent = opts.savingText || '저장 중...';
      }

      try {
        var nextUser = user;

        if (hasProfileUpdate) {
          var formData = new FormData();
          formData.append('nickname', nickname);
          formData.append('university', university);
          formData.append('is_n_su', String(isNsu));
          if (isNsu && prevUniversity) formData.append('prev_university', prevUniversity);
          if (pendingImageFile) formData.append('profileImage', pendingImageFile);

          var profileResponse = await fetch('/api/auth/profile-custom', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });
          var profileData = await profileResponse.json().catch(function () { return {}; });
          if (!profileResponse.ok || !profileData || !profileData.ok) {
            throw new Error(profileData && profileData.error || (opts.profileSaveErrorMessage || '프로필 저장에 실패했어요.'));
          }
          nextUser = profileData.user || nextUser;
        }

        if (hasFriendSettingUpdate) {
          var friendResponse = await fetch('/api/auth/friend-request-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ allow_friend_requests: allowFriendRequests }),
          });
          var friendData = await friendResponse.json().catch(function () { return {}; });
          if (!friendResponse.ok || !friendData || !friendData.ok) {
            throw new Error(friendData && friendData.error || (opts.friendSettingErrorMessage || '동맹 신청 수신 설정 저장에 실패했어요.'));
          }
          nextUser = Object.assign({}, nextUser || {}, { allow_friend_requests: allowFriendRequests });
        }

        applyUser(nextUser);
        pendingImageFile = null;
        syncFromUser();

        if (typeof opts.onSaveSuccess === 'function') {
          await opts.onSaveSuccess(nextUser, {
            hasProfileUpdate: hasProfileUpdate,
            hasFriendSettingUpdate: hasFriendSettingUpdate,
          });
        }

        return true;
      } catch (error) {
        setError(error && error.message ? error.message : (opts.genericSaveErrorMessage || '저장 중 오류가 발생했어요.'));
        if (typeof opts.onSaveError === 'function') {
          await opts.onSaveError(error);
        }
        return false;
      } finally {
        if (elements.saveButton) {
          elements.saveButton.disabled = false;
          elements.saveButton.textContent = saveButtonDefaultText;
        }
      }
    }

    function bind() {
      if (isBound) return api;
      isBound = true;

      if (elements.photoInput) {
        elements.photoInput.addEventListener('change', function () {
          var file = elements.photoInput.files && elements.photoInput.files[0];
          if (!file) return;
          pendingImageFile = file;

          var reader = new FileReader();
          reader.onload = function (event) {
            var previewSrc = String(event && event.target && event.target.result || '');
            if (!previewSrc) return;
            setAvatarPreview(previewSrc, elements.nicknameInput && elements.nicknameInput.value || getUser() && getUser().nickname || '?');
          };
          reader.readAsDataURL(file);
        });
      }

      if (elements.nsuInput) {
        elements.nsuInput.addEventListener('change', function () {
          setPrevVisibility();
        });
      }

      if (elements.nicknameInput) {
        elements.nicknameInput.addEventListener('input', function () {
          if (pendingImageFile) return;
          setAvatarPreview('', elements.nicknameInput.value || getUser() && getUser().nickname || '?');
        });
      }

      if (elements.universityInput && elements.univResults) {
        elements.universityInput.addEventListener('input', function () {
          searchUniversity(elements.universityInput.value, elements.universityInput, elements.univResults);
        });
      }

      if (elements.prevUniversityInput && elements.prevUnivResults) {
        elements.prevUniversityInput.addEventListener('input', function () {
          searchUniversity(elements.prevUniversityInput.value, elements.prevUniversityInput, elements.prevUnivResults);
        });
      }

      if (elements.saveButton) {
        elements.saveButton.addEventListener('click', function () {
          save();
        });
      }

      return api;
    }

    var api = {
      bind: bind,
      save: save,
      syncFromUser: syncFromUser,
      hideUniversityResults: hideUniversityResults,
      setAvatarPreview: setAvatarPreview,
    };

    return api;
  }

  window.PathProfileEditor = {
    create: createProfileEditor,
  };
})();