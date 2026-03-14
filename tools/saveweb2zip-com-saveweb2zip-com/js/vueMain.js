const app = new Vue({
  el: '#app',
  data: {
    popupType: null,
    popupTitle: window.popupSuccessTitle,
    isPopupActive: false,
    isActiveRequest: false,
    // isCaptchaRequested: false,
    // captchaToken: '',
    // captchaExpired: '',
    // captchaExpiredDate: '',
    formOptions: {
      websiteLink: null,
      isLandUnique: false,
      isMobileVersion: false,
      isDefaultDownload: false,
      isSaveStructure: false,
      token: '',
    },
    downloadedFiles: 0,
    apiUrl: 'https://copier.W2Z.com',
  },
  methods: {
    download(filename, url) {
      const element = document.createElement('a');
      element.setAttribute('href', url);
      element.setAttribute('download', filename);

      element.style.display = 'none';
      document.body.appendChild(element);

      element.click();

      document.body.removeChild(element);
    },
    checkProgress(hash) {
      const http = new XMLHttpRequest();
      const url = `${this.apiUrl}/api/getStatus/${hash}`;

      http.open('GET', url, true);
      http.setRequestHeader(
        'Content-type',
        'application/x-www-form-urlencoded',
      );

      http.onreadystatechange = () => {
        if (http.readyState === 4 && http.status === 200) {
          const response = JSON.parse(http.response);

          const numberAnimation = setInterval(() => {
            if (this.downloadedFiles < response.copiedFilesAmount) {
              this.downloadedFiles += 1;
            } else {
              clearInterval(numberAnimation);
            }
          }, 10);

          if (!response.isFinished) {
            setTimeout(() => {
              this.checkProgress(response.md5);
            }, 1500);
          } else if (response.isFinished && response.success) {
            this.download(
              'W2Z.zip',
              `${this.apiUrl}/api/downloadArchive/${hash}`,
            );
            this.popupTitle = window.popupSuccessTitle;
            this.popupType = 'downloadSuccess';
            this.isPopupActive = true;
            this.isActiveRequest = false;
            this.downloadedFiles = response.copiedFilesAmount;
          } else if (response.isFinished && !response.success) {
            this.popupTitle = `${window.popupDeclineTitle} ${window.errors[response.errorText] || ''}`;
            this.popupType = 'downloadDecline';
            this.isPopupActive = true;
            this.isActiveRequest = false;
            this.downloadedFiles = 0;
          }
        } else if (http.readyState === 4 && http.status !== 200) {
          const response = JSON.parse(http.response);
          this.popupTitle = `${window.popupDeclineTitle} ${window.errors[response.errorText] || ''}`;
          this.popupType = 'downloadDecline';
          this.isPopupActive = true;
          this.isActiveRequest = false;
          this.downloadedFiles = 0;
        }
      };

      http.send(null);
    },
    submitForm(evt) {
      evt.preventDefault();

      this.isActiveRequest = true;
      this.downloadedFiles = 0;

      // if (!window.smartCaptcha) {
      //   this.isActiveRequest = false;
      //   return;
      // }

      // this.captchaToken = localStorage.getItem('captchaToken');
      // this.captchaExpired = localStorage.getItem('captchaExpired');
      // this.captchaExpiredDate = parseInt(this.captchaExpired);

      // if (!this.captchaToken ||
      //     !this.captchaExpired ||
      //     this.captchaExpiredDate < Date.now()) {
      //   if (!this.isCaptchaRequested) {
      //     window.smartCaptcha.reset();
      //     window.smartCaptcha.execute();
      //     this.isCaptchaRequested = true;
      //   }
      //   if (window.recaptchaClosed) {
      //     this.isActiveRequest = false;
      //     window.recaptchaClosed = false;
      //     this.isCaptchaRequested = false;
      //     return;
      //   }
      //   setTimeout(() => {
      //     this.submitForm(evt);
      //   }, 500);
      //   return;
      // }

      // this.isCaptchaRequested = false;
      // this.formOptions.token = this.captchaToken;

      const http = new XMLHttpRequest();
      const url = `${this.apiUrl}/api/copySite`;

      http.open('POST', url, true);
      http.setRequestHeader(
        'Content-type',
        'application/json',
      );
      const body = JSON.stringify({
        url: this.formOptions.websiteLink,
        renameAssets: this.formOptions.isLandUnique,
        saveStructure: this.formOptions.isSaveStructure,
        alternativeAlgorithm: this.formOptions.isDefaultDownload,
        mobileVersion: this.formOptions.isMobileVersion,
        // token: this.formOptions.token,
      });
      http.onreadystatechange = () => {
        if (http.readyState === 4 && http.status === 200) {
          const response = JSON.parse(http.response);
          if (response.isFinished && !response.success) {
            // if (response.errorText === 'wrong_captcha') {
            //   localStorage.removeItem('captchaToken');
            //   localStorage.removeItem('captchaExpired');
            // }

            this.popupTitle = `${window.popupDeclineTitle} ${window.errors[response.errorText] || ''}`;
            this.popupType = 'downloadDecline';
            this.isPopupActive = true;
            this.isActiveRequest = false;
          } else {
            this.checkProgress(response.md5);
          }
        } else if (http.readyState === 4 && http.status !== 200) {
          const response = JSON.parse(http.response);

          this.popupTitle = `${window.popupDeclineTitle} ${window.errors[response.errorText] || ''}`;
          this.popupType = 'downloadDecline';
          this.isPopupActive = true;
          this.isActiveRequest = false;
        }
      };
      http.send(body);
    },
    successFormPopup(evt) {
      evt.preventDefault();

      this.isPopupActive = false;
    },
    declineFormPopup(evt) {
      evt.preventDefault();

      this.isPopupActive = false;
    },
    closePopup(evt) {
      evt.preventDefault();
      this.isPopupActive = false;
    },
    isUrlValid(url) {
      return /^https?:\/\/.*/g.test(url);
    },
    isOnionDomain(url) {
      return /.onion$|.onion\//g.test(url);
    },
    onChangeUrl(evt) {
      if (!this.isUrlValid(this.formOptions.websiteLink)
          || this.formOptions.websiteLink.length === 0
          || this.isOnionDomain(this.formOptions.websiteLink)) {
        evt.target.setCustomValidity(window.incorrectLink);
      } else {
        evt.target.setCustomValidity('');
      }
    },
    onChangeLang(evt) {
      window.location.href = `/${evt.target.value}`;
    },
  },
});
