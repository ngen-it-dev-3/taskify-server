// services/chatNotification.service.js

class ChatNotificationService {
    /**
     * Dedupe cache — prevents duplicate notifications when both the
     * wizard and the inbox are mounted in the same browser tab.
     */
    static _recentlyNotified = new Set();

    /**
     * Request permission for desktop notifications
     */
    static async requestPermission() {
        if (!('Notification' in window)) {
            console.log('This browser does not support desktop notifications');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    }

    /* ============================================================
     * TEAM CHAT
     * ============================================================ */

    /**
     * Send a desktop notification for a new message
     */
    static sendMessageNotification(
        senderName,
        messageContent,
        channelName,
        senderAvatar,
        channelId,
        messageId
    ) {
        if (!('Notification' in window)) {
            console.log('Notifications not supported');
            return null;
        }

        if (Notification.permission !== 'granted') {
            console.log('Notification permission not granted');
            return null;
        }

        try {
            // Truncate long messages
            const truncatedContent = messageContent.length > 100
                ? messageContent.substring(0, 100) + '...'
                : messageContent;

            const notification = new Notification(
                `💬 ${senderName} in #${channelName}`,
                {
                    body: truncatedContent || '📎 Sent an attachment',
                    icon: senderAvatar || '/images/default-avatar.png',
                    tag: `chat-${channelId || 'global'}`,
                    data: {
                        channelId: channelId,
                        messageId: messageId,
                        type: 'chat-message',
                    },
                    requireInteraction: false,
                    silent: false,
                }
            );

            // Auto-close after 5 seconds
            setTimeout(() => {
                notification.close();
            }, 5000);

            // Handle click - focus window and optionally navigate
            notification.onclick = () => {
                window.focus();
                notification.close();

                // If we have channel info, you could navigate to it
                if (channelId && window.location) {
                    // You can dispatch a custom event to switch channels
                    window.dispatchEvent(new CustomEvent('focus-channel', {
                        detail: { channelId }
                    }));
                }
            };

            return notification;
        } catch (error) {
            console.error('Error sending notification:', error);
            return null;
        }
    }

    /**
     * Play a notification sound
     */
    static playNotificationSound() {
        try {
            // Use Web Audio API for a gentle ping sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 880; // A5 note
            oscillator.type = 'sine';

            // Quick fade in/out
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            // Silently fail if audio is not supported
            console.log('Audio notification not supported');
        }
    }

    /**
     * Check if the page is visible (user is on the tab)
     */
    static isPageVisible() {
        return !document.hidden;
    }

    /**
     * Send notification only if page is not visible
     */
    static sendNotificationIfAway(
        senderName,
        messageContent,
        channelName,
        senderAvatar,
        channelId,
        messageId
    ) {
        // Only send notification if user is not on the page
        if (!this.isPageVisible()) {
            this.sendMessageNotification(
                senderName,
                messageContent,
                channelName,
                senderAvatar,
                channelId,
                messageId
            );

            // Play sound only if page is not visible
            this.playNotificationSound();

            return true;
        }

        // If page is visible, you might want to show a toast instead
        return false;
    }

    /* ============================================================
     * TENDER CHAT
     * ============================================================ */

    /**
     * Send a desktop notification for a new tender chat message.
     * Returns the Notification instance or null.
     */
    static sendTenderNotification(opts) {
        const {
            senderName,
            messageContent,
            tenderTitle,
            tenderId,
            messageId,
        } = opts || {};

        if (!('Notification' in window)) return null;
        if (Notification.permission !== 'granted') return null;
        if (!tenderId || !messageId) return null;

        try {
            const truncated =
                (messageContent || '').length > 100
                    ? messageContent.slice(0, 100) + '...'
                    : messageContent || '📎 Sent an attachment';

            const notification = new Notification(
                `💬 ${senderName} — Tender Support`,
                {
                    body: tenderTitle ? `${tenderTitle}\n${truncated}` : truncated,
                    icon: '/images/tender-icon.png',
                    tag: `tender-chat-${tenderId}`,
                    data: { tenderId, messageId, type: 'tender-chat' },
                    requireInteraction: false,
                    silent: true, // we play our own ping
                }
            );

            // Auto-close after 6 seconds
            setTimeout(() => notification.close(), 6000);

            notification.onclick = () => {
                window.focus();
                notification.close();
                // Fire an event the wizard/inbox listens for
                window.dispatchEvent(
                    new CustomEvent('tender-chat:focus', {
                        detail: { tenderId },
                    }),
                );
            };

            return notification;
        } catch (err) {
            console.error('[notif] tender notification failed:', err);
            return null;
        }
    }

    /**
     * Send a tender notification only when the page is hidden.
     * Dedupes by messageId so both the wizard and the inbox
     * don't fire the same notification twice.
     */
    static notifyTenderIfAway(opts) {
        if (this.isPageVisible()) return false;

        const messageId = opts && opts.messageId;
        if (messageId) {
            if (this._recentlyNotified.has(messageId)) return false;
            this._recentlyNotified.add(messageId);
            if (this._recentlyNotified.size > 100) {
                this._recentlyNotified.clear();
            }
        }

        this.sendTenderNotification(opts);
        this.playNotificationSound();
        return true;
    }
}

export default ChatNotificationService;