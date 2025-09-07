// --- Config & helpers ---
const API = {
  users: 'https://jsonplaceholder.typicode.com/users',
  posts: 'https://jsonplaceholder.typicode.com/posts',
  comments: id => `https://jsonplaceholder.typicode.com/comments?postId=${id}`
};

const storage = {
  get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},
  set(k,v){localStorage.setItem(k,JSON.stringify(v))}
};

let state = {users:[], posts:[], commentsCount:0};

function showLoader(on=true){ if(on) $('#loader').show(); else $('#loader').hide(); }

function openModal(html){ $('#modalContent').html(html); $('#modalBackdrop').fadeIn(150); }
function closeModal(){ $('#modalBackdrop').fadeOut(120); }

function notify(type,msg){ toastr[type](msg); }

// --- Init ---
$(async function(){
  toastr.options = { positionClass: 'toast-bottom-right', timeOut: 1800 };

  // theme
  const savedTheme = localStorage.getItem('theme')||'light';
  $('#app').attr('data-theme', savedTheme);
  $('#themeToggle').prop('checked', savedTheme==='dark');
  $('#themeToggle').on('change', ()=>{
    const t = $('#themeToggle').is(':checked')? 'dark':'light';
    $('#app').attr('data-theme', t); localStorage.setItem('theme', t);
  });

  // nav
  function showView(name){ $('.view').hide(); $(`#${name}View`).show(); $('.nav-link').removeClass('active'); $(`.nav-link[data-target=${name}]`).addClass('active'); $('#pageTitle').text(name.charAt(0).toUpperCase()+name.slice(1)); }
  function handleHash(){ const h = location.hash.replace('#','')||'dashboard'; showView(h); if(h==='users') loadUsers(); if(h==='posts') loadPosts(); }
  $(window).on('hashchange', handleHash); handleHash();

  // global search apply to posts table search
  $('#globalSearch').on('input', function(){ const v=$(this).val().toLowerCase(); $('#postSearch').val(v).trigger('input'); $('#usersTable').DataTable && $('#usersTable').DataTable().search(v).draw(); });

  // load initial data
  await loadCounts();
  handleHash();
  showLoader(false);
});

// --- Data load / counts ---
async function fetchJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error('Network'); return r.json(); }

async function loadCounts(){ showLoader(true);
  try{
    const [users, posts, comments] = await Promise.all([fetchJSON(API.users), fetchJSON(API.posts), fetchJSON('https://jsonplaceholder.typicode.com/comments')]);
    state.users = users; state.posts = posts;
    $('#statUsers').text(users.length); $('#statPosts').text(posts.length); $('#statComments').text(comments.length);
  }catch(e){ console.error(e); notify('error','Failed to load counts'); }
  showLoader(false);
}

// --- USERS ---
async function loadUsers(){ showLoader(true);
  try{
    if(state.users.length===0) state.users = await fetchJSON(API.users);
    const favs = storage.get('favUsers')||{};
    const tbody = state.users.map(u=>{
      const fav = favs[u.id]? '★':'☆';
      return `<tr data-id="${u.id}"><td class="favCell"><span class="fav" data-id="${u.id}">${fav}</span></td><td>${u.id}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td><button class="btnView" data-id="${u.id}">View</button> <button class="btnEdit" data-id="${u.id}">Edit</button> <button class="btnDel" data-id="${u.id}">Delete</button></td></tr>`;
    }).join('');
    $('#usersTable tbody').html(tbody);

    // init DataTable (destroy if exists)
    if($.fn.dataTable.isDataTable('#usersTable')) $('#usersTable').DataTable().destroy();
    $('#usersTable').DataTable({pageLength:6});

    // events
    $('#usersTable').off('click', '.fav').on('click', '.fav', function(){
      const id = $(this).data('id'); toggleFav(id); $(this).text(storage.get('favUsers') && storage.get('favUsers')[id] ? '★':'☆');
    });

    $('#usersTable').off('click', '.btnView').on('click', '.btnView', function(){ const id=$(this).data('id'); viewUser(id); });
    $('#usersTable').off('click', '.btnEdit').on('click', '.btnEdit', function(){ editUser($(this).data('id')); });
    $('#usersTable').off('click', '.btnDel').on('click', '.btnDel', function(){ deleteUser($(this).data('id')); });

  }catch(e){console.error(e); notify('error','Failed loading users');}
  showLoader(false);
}

function toggleFav(id){ const favs = storage.get('favUsers')||{}; favs[id] = !favs[id]; storage.set('favUsers', favs); notify('success', favs[id] ? 'Added to favorites' : 'Removed from favorites'); }

function viewUser(id){ const u = state.users.find(x=>x.id==id); openModal(`<h3>${escapeHtml(u.name)} <span style="float:right">ID ${u.id}</span></h3><p><strong>Username:</strong> ${escapeHtml(u.username)}</p><p><strong>Email:</strong> ${escapeHtml(u.email)}</p><p><strong>Phone:</strong> ${escapeHtml(u.phone)}</p><p><strong>Website:</strong> ${escapeHtml(u.website)}</p><p style="text-align:right"><button id="closeModalBtn">Close</button></p>`);
  $('#closeModalBtn').on('click', closeModal);
}

function editUser(id){ const u = state.users.find(x=>x.id==id); openModal(`<h3>Edit ${escapeHtml(u.name)}</h3>
  <p><label>Name<br><input id="editName" value="${escapeHtml(u.name)}" style="width:100%"/></label></p>
  <p><label>Email<br><input id="editEmail" value="${escapeHtml(u.email)}" style="width:100%"/></label></p>
  <p style="text-align:right"><button id="saveUser">Save</button> <button id="cancelUser">Cancel</button></p>`);
  $('#saveUser').on('click', ()=>{
    u.name = $('#editName').val(); u.email = $('#editEmail').val(); notify('success','User updated locally'); closeModal(); loadUsers(); });
  $('#cancelUser').on('click', closeModal);
}

function deleteUser(id){ if(!confirm('Delete user locally?')) return; state.users = state.users.filter(x=>x.id!=id); notify('success','User removed locally'); loadUsers(); }

// --- POSTS ---
async function loadPosts(){ showLoader(true);
  try{
    // load posts (and merge with local changes)
    const remote = await fetchJSON(API.posts);
    const localPosts = storage.get('localPosts')||{}; // store by id or new local ids
    // merge: remote posts overwritten by local if exists
    const posts = remote.map(p => localPosts[p.id]? localPosts[p.id] : p);
    // include any client-only posts (ids negative)
    const clientOnly = Object.values(localPosts).filter(p=>p.id<0);
    state.posts = posts.concat(clientOnly).sort((a,b)=>b.id-a.id);

    renderPosts(state.posts);
  }catch(e){ console.error(e); notify('error','Failed to load posts'); }
  showLoader(false);
}

function renderPosts(posts){ const container = $('#postsList'); container.empty();
  posts.forEach(p=>{
    const el = $(`<div class="post-card" data-id="${p.id}"><strong>${escapeHtml(p.title)}</strong><span style="float:right">ID ${p.id}</span><p>${escapeHtml(p.body)}</p><div><button class="btnComments" data-id="${p.id}">Comments</button> <button class="btnEditPost" data-id="${p.id}">Edit</button> <button class="btnDelPost" data-id="${p.id}">Delete</button></div><div class="commentsArea" style="margin-top:8px;display:none"></div></div>`);
    container.append(el);
  });

  // events
  $('.btnComments').off('click').on('click', async function(){ const id=$(this).data('id'); const parent=$(this).closest('.post-card'); const area=parent.find('.commentsArea'); if(area.is(':visible')){ area.slideUp(); return;} area.html('Loading comments...').slideDown(); try{ const c= await fetchJSON(API.comments(id)); const html = c.map(x=>`<div style="border-top:1px solid #eee;padding:6px"><strong>${escapeHtml(x.name)}</strong><p>${escapeHtml(x.body)}</p><small>${escapeHtml(x.email)}</small></div>`).join(''); area.html(html);}catch(e){ area.html('Failed to load comments'); }
  });

  $('.btnEditPost').off('click').on('click', function(){ editPost($(this).data('id')); });
  $('.btnDelPost').off('click').on('click', function(){ deletePost($(this).data('id')); });
}

// live search
$('#postSearch').on('input', function(){ const q=$(this).val().toLowerCase(); $('#postsList .post-card').each(function(){ const t=$(this).find('strong').text()+ ' ' + $(this).find('p').text(); $(this).toggle(t.toLowerCase().includes(q)); }); });

// new post
$('#btnNewPost').on('click', function(){ openModal(`<h3>New Post</h3>
  <p><input id="newTitle" placeholder="Title" style="width:100%"/></p>
  <p><textarea id="newBody" placeholder="Body" style="width:100%"></textarea></p>
  <p style="text-align:right"><button id="saveNewPost">Create</button> <button id="cancelNewPost">Cancel</button></p>`);
  $('#saveNewPost').on('click', ()=>{
    const title = $('#newTitle').val().trim(); const body = $('#newBody').val().trim(); if(!title) return notify('error','Title required'); createLocalPost({title,body}); closeModal(); });
  $('#cancelNewPost').on('click', closeModal);
});

function createLocalPost(post){ const local = storage.get('localPosts')||{}; // generate negative id
  const negId = (storage.get('nextLocalId')||-1); storage.set('nextLocalId', negId-1);
  const p = {id: negId, userId: 1, title: post.title, body: post.body}; local[p.id]=p; storage.set('localPosts', local); notify('success','Post created locally'); loadPosts(); }

function editPost(id){ const p = (state.posts.find(x=>x.id==id) || {});
  openModal(`<h3>Edit Post ${id}</h3>
    <p><input id="editTitle" value="${escapeHtml(p.title||'')}" style="width:100%"/></p>
    <p><textarea id="editBody" style="width:100%">${escapeHtml(p.body||'')}</textarea></p>
    <p style="text-align:right"><button id="saveEditPost">Save</button> <button id="cancelEditPost">Cancel</button></p>`);
  $('#saveEditPost').on('click', ()=>{
    const title = $('#editTitle').val().trim(); const body = $('#editBody').val().trim(); if(!title){ notify('error','Title required'); return; }
    const local = storage.get('localPosts')||{}; const p2 = {...p, title, body}; local[p2.id]=p2; storage.set('localPosts', local); notify('success','Post saved locally'); closeModal(); loadPosts(); });
  $('#cancelEditPost').on('click', closeModal);
}

function deletePost(id){ if(!confirm('Delete post locally?')) return; const local = storage.get('localPosts')||{}; if(id<0){ delete local[id]; } else { local[id] = {...(local[id]||{}), deleted:true}; }
  storage.set('localPosts', local); notify('success','Post marked deleted locally'); loadPosts(); }

// When loading posts, filter deleted local ones
function mergeLocalPosts(remote, localObj){ const local = localObj||{}; const arr = remote.map(p=> local[p.id] && local[p.id].deleted ? null : (local[p.id] || p)).filter(Boolean); const clientOnly = Object.values(local).filter(p=>p.id<0); return arr.concat(clientOnly); }

// --- Utility ---
function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/[&<>"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }

// small improvement: re-run current view when storage changed externally
window.addEventListener('storage', ()=>{ if(location.hash.includes('posts')) loadPosts(); if(location.hash.includes('users')) loadUsers(); });

// close modal on backdrop click
$('#modalBackdrop').on('click', function(e){ if(e.target===this) closeModal(); });
