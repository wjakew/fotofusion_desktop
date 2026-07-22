// Onboarding Tour — first-run welcome carousel
// Self-contained: FotoFusionApp owns the instance and triggers it.
class OnboardingTour {
    static STORAGE_KEY = 'ff.onboardingCompleted';

    constructor() {
        this.overlay = document.getElementById('onboardingOverlay');
        this.viewport = document.getElementById('obViewport');
        this.slides = Array.from(this.viewport.querySelectorAll('.ob-slide'));
        this.dotsContainer = document.getElementById('obDots');
        this.backBtn = document.getElementById('obBackBtn');
        this.nextBtn = document.getElementById('obNextBtn');
        this.skipBtn = document.getElementById('obSkipBtn');

        this.index = 0;
        this.isOpen = false;
        this.previousFocus = null;
        this.closeTimer = null;
        this.handleKeydown = this.handleKeydown.bind(this);

        // Dots generated from slide count so it stays single-sourced
        this.dots = this.slides.map((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'ob-dot';
            dot.type = 'button';
            dot.setAttribute('role', 'tab');
            dot.setAttribute('aria-label', `Slide ${i + 1} of ${this.slides.length}`);
            dot.addEventListener('click', () => this.goTo(i));
            this.dotsContainer.appendChild(dot);
            return dot;
        });

        this.backBtn.addEventListener('click', () => this.goTo(this.index - 1));
        this.nextBtn.addEventListener('click', () => {
            if (this.index === this.slides.length - 1) {
                this.close();
            } else {
                this.goTo(this.index + 1);
            }
        });
        this.skipBtn.addEventListener('click', () => this.close());
    }

    maybeShowFirstRun() {
        if (localStorage.getItem(OnboardingTour.STORAGE_KEY)) return;
        // Wait for the launch animation gate (body.ready at 150ms) to settle
        setTimeout(() => this.open(), 500);
    }

    open() {
        if (this.isOpen) return;
        clearTimeout(this.closeTimer);
        this.isOpen = true;
        this.previousFocus = document.activeElement;
        this.overlay.hidden = false;
        this.overlay.classList.remove('closing');
        this.goTo(0, true);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => this.overlay.classList.add('active'));
        });
        this.nextBtn.focus();
        // Capture phase so the app's Esc chain and Cmd shortcuts never fire while open
        document.addEventListener('keydown', this.handleKeydown, true);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        localStorage.setItem(OnboardingTour.STORAGE_KEY, '1');
        document.removeEventListener('keydown', this.handleKeydown, true);
        this.overlay.classList.remove('active');
        this.overlay.classList.add('closing');
        this.closeTimer = setTimeout(() => {
            this.overlay.classList.remove('closing');
            this.overlay.hidden = true;
        }, 300);
        if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
            this.previousFocus.focus();
        }
    }

    goTo(next, instant = false) {
        const clamped = Math.max(0, Math.min(this.slides.length - 1, next));
        const current = this.slides[this.index];
        const dir = clamped < this.index ? 'back' : 'next';
        this.overlay.dataset.dir = dir;

        if (!instant && clamped !== this.index && current.classList.contains('active')) {
            current.classList.remove('active');
            current.classList.add('leaving');
            const clear = () => current.classList.remove('leaving');
            current.addEventListener('animationend', clear, { once: true });
            setTimeout(clear, 400); // fallback if animations are disabled
        }

        this.slides.forEach((slide, i) => {
            if (i !== clamped) slide.classList.remove('active');
        });
        if (instant) this.slides.forEach((slide) => slide.classList.remove('leaving'));

        this.index = clamped;
        // Force restart of the enter animation when re-activating a slide
        const incoming = this.slides[clamped];
        if (!incoming.classList.contains('active')) {
            void incoming.offsetWidth;
            incoming.classList.add('active');
        }

        this.dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === clamped);
            dot.setAttribute('aria-selected', i === clamped ? 'true' : 'false');
        });
        // visibility (not display) keeps footer layout stable — no reflow
        this.backBtn.style.visibility = clamped === 0 ? 'hidden' : 'visible';
        this.nextBtn.textContent = clamped === this.slides.length - 1 ? 'Get Started' : 'Next';
    }

    handleKeydown(e) {
        if (!this.isOpen) return;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.goTo(this.index + 1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.goTo(this.index - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.index === this.slides.length - 1) {
                this.close();
            } else {
                this.goTo(this.index + 1);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        } else if (e.key === 'Tab') {
            // Simple focus trap over the overlay's controls
            const focusables = [this.skipBtn, ...this.dots, this.backBtn, this.nextBtn]
                .filter((el) => el.offsetParent !== null && el.style.visibility !== 'hidden');
            const idx = focusables.indexOf(document.activeElement);
            e.preventDefault();
            const nextIdx = e.shiftKey
                ? (idx <= 0 ? focusables.length - 1 : idx - 1)
                : (idx === focusables.length - 1 || idx === -1 ? 0 : idx + 1);
            focusables[nextIdx].focus();
        }
        // Shield the app's document-level keydown handlers while the tour is open
        e.stopPropagation();
    }
}
