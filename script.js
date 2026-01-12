// Check localStorage for vandalized state on page load
document.addEventListener('DOMContentLoaded', function() {
    const isVandalized = localStorage.getItem('vandalized') === 'true';
    const vandalizeLink = document.getElementById('vandalize-link');

    if (isVandalized) {
        document.body.classList.add('vandalized');
        vandalizeLink.textContent = "I'm going green!";
    }

    // Add click event listener
    vandalizeLink.addEventListener('click', function(e) {
        e.preventDefault();

        const currentlyVandalized = document.body.classList.contains('vandalized');

        if (currentlyVandalized) {
            // Revert to normal
            document.body.classList.remove('vandalized');
            vandalizeLink.textContent = 'Vandalize this page!';
            localStorage.setItem('vandalized', 'false');
        } else {
            // Apply vandalized colors
            document.body.classList.add('vandalized');
            vandalizeLink.textContent = "I'm going green!";
            localStorage.setItem('vandalized', 'true');
        }
    });

    // Skeleton bagpipe animation on logo click
    const heroLogo = document.querySelector('.hero-logo');
    if (heroLogo) {
        heroLogo.addEventListener('click', function() {
            // Create the animated skeleton
            const skeleton = document.createElement('img');
            skeleton.src = 'images/skeletonBagpipe.png';
            skeleton.style.position = 'fixed';
            skeleton.style.top = '20px';
            skeleton.style.left = '-300px';
            skeleton.style.height = '240px';
            skeleton.style.width = 'auto';
            skeleton.style.zIndex = '1000';
            skeleton.style.transition = 'left 3s linear';
            skeleton.style.pointerEvents = 'none';

            document.body.appendChild(skeleton);

            // Trigger animation after a brief delay
            setTimeout(() => {
                skeleton.style.left = '100vw';
            }, 10);

            // Remove the skeleton after animation completes
            setTimeout(() => {
                skeleton.remove();
            }, 3100);
        });
    }
});
