import { supabase } from './supabase.js';

let currentUser = null;
let selectedUser = null;
let channel = null;
let chatUsers = [];

function setStatus(message = '') {
    const status = document.getElementById('status');

    if (status) {
        status.textContent = message;
    }
}

function usernameFromEmail(email, id) {
    return `${email.split('@')[0]}-${id.slice(0, 8)}`;
}

function getInitial(username) {
    return username.trim().charAt(0).toUpperCase() || 'C';
}

function parseMessageDate(dateString) {
    const hasTimezone = /z$|[+-]\d{2}:\d{2}$/i.test(dateString);
    return new Date(hasTimezone ? dateString : `${dateString}Z`);
}

function formatDateLabel(dateString) {
    const date = parseMessageDate(dateString);
    const today = new Date();
    const yesterday = new Date();

    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    }

    if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }

    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function formatMessageTime(dateString) {
    return parseMessageDate(dateString).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatLastSeen() {
    return `Last updated ${new Date().toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    })}`;
}

function updateComposerState() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const charCount = document.getElementById('charCount');
    const length = input.value.trim().length;

    charCount.textContent = length;
    sendBtn.disabled = !selectedUser || length === 0;
}

function showWelcomeState(title, text) {
    const messagesDiv = document.getElementById('messages');

    messagesDiv.innerHTML = '';

    const welcome = document.createElement('div');
    welcome.className = 'welcome-state';

    const icon = document.createElement('div');
    icon.className = 'welcome-icon';
    icon.textContent = 'C';

    const heading = document.createElement('h2');
    heading.textContent = title;

    const body = document.createElement('p');
    body.textContent = text;

    welcome.appendChild(icon);
    welcome.appendChild(heading);
    welcome.appendChild(body);
    messagesDiv.appendChild(welcome);
}

function renderUsers(users) {
    const usersDiv = document.getElementById('users');
    const usersMeta = document.getElementById('usersMeta');

    usersDiv.innerHTML = '';
    usersMeta.textContent = `${users.length} chat${users.length === 1 ? '' : 's'} available`;

    if (users.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = chatUsers.length === 0
            ? 'No chats yet'
            : 'No chats match your search';

        usersDiv.appendChild(empty);
        return;
    }

    users.forEach(user => {

        const div =
            document.createElement('div');

        div.className = 'user';

        if (selectedUser && selectedUser.id === user.id) {
            div.classList.add('active');
        }

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = getInitial(user.username);

        const info = document.createElement('div');
        info.className = 'user-info';

        const name = document.createElement('strong');
        name.textContent = user.username;

        const preview = document.createElement('small');
        preview.textContent = selectedUser && selectedUser.id === user.id
            ? 'Current chat'
            : 'Tap to open chat';

        info.appendChild(name);
        info.appendChild(preview);
        div.appendChild(avatar);
        div.appendChild(info);

        div.addEventListener('click', () => {

            selectedUser = user;

            document
                .querySelectorAll('.user')
                .forEach(item => item.classList.remove('active'));

            div.classList.add('active');

            document.getElementById('chatUser')
                .textContent = user.username;

            document.getElementById('chatStatus')
                .textContent = formatLastSeen();

            document.querySelector('.chat-title .avatar')
                .textContent = getInitial(user.username);

            setStatus('');
            updateComposerState();
            loadMessages();
        });

        usersDiv.appendChild(div);
    });
}

function filterUsers() {
    const query = document
        .getElementById('userSearch')
        .value
        .trim()
        .toLowerCase();

    const filteredUsers = chatUsers.filter(user =>
        user.username.toLowerCase().includes(query)
    );

    renderUsers(filteredUsers);
}

async function ensureProfile(user) {
    const { error } = await supabase
        .from('profiles')
        .upsert(
            {
                id: user.id,
                username: usernameFromEmail(user.email, user.id)
            },
            {
                onConflict: 'id'
            }
        );

    if (error) {
        console.log('Profile error:', error);
        setStatus(error.message);
        alert(error.message);
        return false;
    }

    return true;
}

/* =========================
   SIGNUP
========================= */
window.signup = async () => {

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        alert('Enter email and password');
        return;
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) {
        alert(error.message);
        return;
    }

    if (data.user) {
        await ensureProfile(data.user);
    }

    alert('Signup successful');
};

/* =========================
   LOGIN
========================= */
window.login = async () => {

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const { data, error } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        alert(error.message);
        return;
    }

    currentUser = data.user;

    const profileReady = await ensureProfile(currentUser);

    if (!profileReady) return;

    document.getElementById('auth').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    await loadUsers();
    subscribeRealtime();
};

/* =========================
   LOAD USERS
========================= */
async function loadUsers() {

    const { data, error } =
        await supabase
            .from('profiles')
            .select('*')
            .order('username');

    if (error) {
        console.log(error);
        setStatus(error.message);
        return;
    }

    const usersDiv =
        document.getElementById('users');

    usersDiv.innerHTML = '';

    chatUsers = data.filter(user => user.id !== currentUser.id);

    filterUsers();
}

/* =========================
   LOAD MESSAGES
========================= */
async function loadMessages() {

    if (!selectedUser) return;

    const { data, error } =
        await supabase
            .from('messages')
            .select('*')
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),` +
                `and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
            )
            .order('created_at', {
                ascending: true
            });

    if (error) {
        console.log(error);
        setStatus(error.message);
        return;
    }

    const messagesDiv =
        document.getElementById('messages');

    messagesDiv.innerHTML = '';

    if (data.length === 0) {
        showWelcomeState(
            selectedUser.username,
            'No messages yet. Send the first message.'
        );
        return;
    }

    let lastDateLabel = '';

    data.forEach(msg => {

        const dateLabel = formatDateLabel(msg.created_at);

        if (dateLabel !== lastDateLabel) {
            const separator = document.createElement('div');
            separator.className = 'date-separator';
            separator.textContent = dateLabel;
            messagesDiv.appendChild(separator);
            lastDateLabel = dateLabel;
        }

        const bubble =
            document.createElement('div');

        bubble.className =
            msg.sender_id === currentUser.id
                ? 'msg sent'
                : 'msg received';

        const body = document.createElement('div');
        body.textContent = msg.message;

        const time = document.createElement('small');
        time.textContent = formatMessageTime(msg.created_at);

        bubble.appendChild(body);
        bubble.appendChild(time);

        messagesDiv.appendChild(bubble);
    });

    messagesDiv.scrollTop =
        messagesDiv.scrollHeight;
}

/* =========================
   SEND MESSAGE
========================= */
window.sendMessage = async () => {

    if (!selectedUser) {
        alert('Select a user first');
        return;
    }

    const input =
        document.getElementById('messageInput');

    const text =
        input.value.trim();

    if (!text) return;

    setStatus('Sending...');

    const { error } =
        await supabase
            .from('messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: selectedUser.id,
                message: text
            })
            .select()
            .single();

    if (error) {
        console.log(error);
        setStatus(error.message);
        alert(error.message);
        return;
    }

    input.value = '';
    setStatus('');
    updateComposerState();

    await loadMessages();
};

/* =========================
   REALTIME
========================= */
function subscribeRealtime() {

    if (channel) {
        supabase.removeChannel(channel);
    }

    channel =
        supabase
            .channel('chat-room')

            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'messages'
                },
                () => {

                    if (selectedUser) {
                        loadMessages();
                    }
                }
            )

            .subscribe(status => {
                console.log(
                    'Realtime Status:',
                    status
                );

                if (status === 'CHANNEL_ERROR') {
                    setStatus('Realtime connection failed. Messages still load after sending or selecting a chat.');
                }
            });
}

/* =========================
   DARK MODE
========================= */
const themeBtn =
    document.getElementById('themeBtn');

if (themeBtn) {

    themeBtn.addEventListener(
        'click',
        () => {
            document.body.classList.toggle('dark');
        }
    );
}

document
    .getElementById('messageInput')
    .addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

document
    .getElementById('messageInput')
    .addEventListener('input', updateComposerState);

document
    .getElementById('userSearch')
    .addEventListener('input', filterUsers);

updateComposerState();
