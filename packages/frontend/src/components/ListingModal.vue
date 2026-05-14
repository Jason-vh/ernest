<template>
  <Teleport to="body">
    <Transition name="photo-viewer">
      <PhotoViewer
        v-if="listing && photoFullscreenOpen"
        :key="listing.fundaId"
        :photos="listing.photos"
        :initial-index="photoViewerIndex"
        @close="closePhotoViewer"
        @select="onPhotoViewerSelect"
      />
    </Transition>

    <Transition name="listing-modal">
      <div
        v-if="listing && !photoFullscreenOpen"
        class="fixed inset-0 z-100 flex flex-col items-center justify-end bg-black/20 backdrop-blur-[6px] sm:justify-center"
        @click.self="close"
      >
        <!-- Cluster nav above modal -->
        <div v-if="isCluster" class="mb-2 flex items-center gap-3" @click.stop>
          <button
            class="cluster-arrow flex sm:hidden"
            title="Previous listing (←)"
            @click="navigateCluster(-1)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span
            class="rounded-full bg-black/50 px-3 py-1 text-[12px] font-medium tabular-nums text-white/90 backdrop-blur-sm"
          >
            {{ currentClusterIndex + 1 }} / {{ clusterListingIds.length }}
          </span>
          <button
            class="cluster-arrow flex sm:hidden"
            title="Next listing (→)"
            @click="navigateCluster(1)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <!-- Row: optional prev arrow + modal + optional next arrow -->
        <div class="flex w-full items-center justify-center gap-3" @click.self="close">
          <!-- Prev arrow (desktop only) -->
          <button
            v-if="isCluster"
            class="cluster-arrow hidden flex-shrink-0 sm:flex"
            title="Previous listing (←)"
            @click="navigateCluster(-1)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div
            ref="modalRef"
            role="dialog"
            aria-modal="true"
            aria-label="Listing details"
            tabindex="-1"
            class="listing-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[14px] bg-white/90 shadow-[0_8px_40px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.08)] outline-none backdrop-blur-[24px] sm:max-h-[calc(100dvh-6rem)] sm:max-w-[580px] sm:rounded-[14px]"
            @keydown="trapFocus"
          >
            <!-- Scrollable content -->
            <div ref="scrollContainerRef" class="flex-1 overflow-y-auto overscroll-none">
              <!-- Photo gallery -->
              <div v-if="listing.photos.length > 0" class="relative">
                <!-- Floating top bar (zero-height sticky overlay, no layout impact) -->
                <div
                  class="pointer-events-none sticky top-0 z-20 flex h-0 items-start justify-end gap-1.5 overflow-visible px-2.5"
                >
                  <div class="flex gap-1.5 pt-2.5 max-sm:gap-2 max-sm:pt-2">
                    <button
                      class="pointer-events-auto relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55 max-sm:h-10 max-sm:w-10"
                      title="Copy link"
                      @click="copyLink"
                    >
                      <Transition name="icon-swap" mode="out-in">
                        <svg
                          v-if="!linkCopied"
                          key="link"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                        <svg
                          v-else
                          key="check"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </Transition>
                    </button>
                    <button
                      class="pointer-events-auto relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55 max-sm:h-10 max-sm:w-10"
                      title="Show on map"
                      @click="showOnMap"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                      </svg>
                    </button>
                    <button
                      class="pointer-events-auto relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55 max-sm:h-10 max-sm:w-10"
                      @click="close"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <PhotoGallery :photos="listing.photos" @open-photo="openPhotoViewer" />

                <!-- Bottom-right chips overlay -->
                <div
                  class="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-wrap justify-end gap-1"
                >
                  <!-- source -->
                  <span class="chip">{{ sourceLabel }}</span>

                  <!-- age on market -->
                  <span v-if="listingAgeChip" class="chip">{{ listingAgeChip }}</span>

                  <!-- bathtub (AI-detected) -->
                  <span
                    v-if="listing.aiHasBathtub === true"
                    class="chip chip--green"
                    title="Bathtub"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M7 10V6a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v1" />
                      <path d="M2 10h20v4a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6v-4z" />
                      <path d="M6 20v2M18 20v2" />
                    </svg>
                  </span>

                  <!-- outside area (AI or structured data) -->
                  <span v-if="chipHasOutsideArea" class="chip chip--green" title="Outside area">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"
                      />
                      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
                    </svg>
                  </span>

                  <!-- scheduled viewing -->
                  <span v-if="listing.viewing" class="chip chip--blue" title="Viewing scheduled">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    Viewing
                  </span>
                  <!-- applied -->
                  <span
                    v-if="listing.state === 'applied'"
                    class="chip chip--blue"
                    title="Application submitted"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Applied
                  </span>
                </div>
              </div>

              <!-- Top bar fallback when no photos -->
              <div v-else class="flex items-center justify-end gap-1.5 px-2.5 pt-2.5 pb-1.5">
                <button
                  class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/10 text-[#666] transition-colors hover:bg-black/15"
                  title="Copy link"
                  @click="copyLink"
                >
                  <Transition name="icon-swap" mode="out-in">
                    <svg
                      v-if="!linkCopied"
                      key="link"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <svg
                      v-else
                      key="check"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </Transition>
                </button>
                <button
                  class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/10 text-[#666] transition-colors hover:bg-black/15"
                  title="Show on map"
                  @click="showOnMap"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                  </svg>
                </button>
                <button
                  class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/10 text-[#666] transition-colors hover:bg-black/15"
                  @click="close"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div class="flex flex-col gap-0 px-5 pt-4 pb-5">
                <!-- Address + Price row -->
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <h2 class="m-0 text-[17px] font-semibold leading-tight text-[#1a1a1a]">
                      {{ listing.address }}
                    </h2>
                    <p
                      v-if="listing.neighbourhood || listing.city || listing.postcode"
                      class="m-0 mt-1 text-[13px] text-[#888]"
                    >
                      <span v-if="listing.neighbourhood">{{ listing.neighbourhood }}</span>
                      <span v-if="listing.neighbourhood && listing.city"> &middot; </span>
                      <span v-if="listing.city">{{ listing.city }}</span>
                      <span v-if="(listing.neighbourhood || listing.city) && listing.postcode">
                        &middot;
                      </span>
                      <span v-if="listing.postcode">{{ listing.postcode }}</span>
                    </p>
                  </div>
                  <div class="flex-shrink-0 text-right">
                    <div class="text-[20px] font-bold tracking-[-0.02em] text-[#1a1a1a]">
                      {{ formatPrice(listing.price) }}
                    </div>
                    <div class="mt-0.5 text-[11px] text-[#999]">per month</div>
                  </div>
                </div>

                <!-- Key facts (inline) with status + energy badges -->
                <div v-if="keyFacts || energyLabelBadge" class="mt-2.5 text-[13px] text-[#666]">
                  <span
                    v-if="listing.status === 'Beschikbaar'"
                    class="mr-1.5 inline-block rounded bg-emerald-500/10 px-1.5 py-[1px] text-[11px] font-semibold text-emerald-700"
                    >Available</span
                  ><span
                    v-if="energyLabelBadge"
                    class="mr-1.5 inline-block rounded px-1.5 py-[1px] text-[11px] font-semibold"
                    :class="energyLabelBadge.cls"
                    >{{ energyLabelBadge.text }}</span
                  >{{ keyFacts }}
                </div>

                <!-- "What's the catch?" — skeptical AI analysis -->
                <div v-if="catchSectionVisible" class="mt-4 border-t border-black/6 pt-4">
                  <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    What's the catch?
                  </div>

                  <div v-if="catchAnalyzing" class="flex flex-col gap-2">
                    <div
                      v-for="(width, idx) in catchSkeletonWidths"
                      :key="idx"
                      class="flex items-center gap-2"
                    >
                      <span class="catch-skeleton-dot flex-shrink-0"></span>
                      <span class="catch-skeleton-bar" :style="{ width }"></span>
                    </div>
                  </div>

                  <ul
                    v-else-if="listing.aiCatch && listing.aiCatch.length > 0"
                    class="m-0 flex list-none flex-col gap-1.5 p-0"
                  >
                    <li
                      v-for="(concern, idx) in listing.aiCatch"
                      :key="idx"
                      class="flex items-start gap-2 text-[13px] leading-snug"
                    >
                      <span
                        class="catch-dot mt-1.5 flex-shrink-0"
                        :class="catchDotClass(concern.severity)"
                        :title="concern.severity"
                      ></span>
                      <span class="text-[#444]">{{ concern.flag }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Actions grid (logged-in users) -->
                <div v-if="user" class="mt-3">
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      class="reaction-btn"
                      :class="{
                        'reaction-btn--active reaction-btn--fav': listing.state === 'liked',
                      }"
                      :disabled="stateSaving"
                      @click="toggleState('liked')"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                          :fill="listing.state === 'liked' ? 'currentColor' : 'none'"
                        />
                      </svg>
                      {{ listing.state === "liked" ? "Favourited" : "Favourite" }}
                    </button>
                    <button
                      class="reaction-btn"
                      :class="{
                        'reaction-btn--active reaction-btn--discard': listing.state === 'discarded',
                      }"
                      :disabled="stateSaving"
                      @click="toggleState('discarded')"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      {{ listing.state === "discarded" ? "Discarded" : "Discard" }}
                    </button>
                    <button
                      class="reaction-btn"
                      :class="{
                        'reaction-btn--active reaction-btn--viewing': listing.state === 'viewing',
                      }"
                      :disabled="viewingEditorOpen"
                      @click="openViewingEditor"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      Viewing
                    </button>
                    <button
                      class="reaction-btn"
                      :class="{
                        'reaction-btn--active reaction-btn--applied': listing.state === 'applied',
                      }"
                      :disabled="stateSaving"
                      @click="toggleState('applied')"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      {{ listing.state === "applied" ? "Applied" : "Apply" }}
                    </button>
                  </div>
                  <span
                    v-if="listing.stateBy"
                    class="mt-1.5 block text-right text-[11px] text-[#bbb]"
                  >
                    by {{ listing.stateBy }}
                  </span>

                  <!-- Inline note editor (shows when discarded or when note exists) -->
                  <div v-if="noteEditorOpen" class="note-editor mt-2.5">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[11px] font-medium text-[#999]">
                        {{ ownNote ? "Your note" : "Add a note" }}
                      </span>
                      <span v-if="noteSaving" class="text-[11px] font-normal text-[#bbb]"
                        >saving...</span
                      >
                      <span v-else-if="noteSaved" class="text-[11px] font-normal text-emerald-600"
                        >saved</span
                      >
                    </div>
                    <textarea
                      v-model="ownNoteText"
                      rows="2"
                      class="mt-1 w-full resize-none rounded-lg border border-black/10 bg-white/80 px-3 py-2 font-inherit text-[13px] text-[#333] outline-none transition-colors placeholder:text-[#bbb] focus:border-black/20 focus:bg-white"
                      placeholder="Why do you like or dislike this place?"
                    ></textarea>
                  </div>
                </div>

                <!-- Read-only state display (logged-out users) -->
                <div
                  v-else-if="
                    (listing.state === 'liked' || listing.state === 'discarded') && listing.stateBy
                  "
                  class="mt-3 flex items-center gap-1.5 text-[12px] text-[#999]"
                >
                  <svg
                    v-if="listing.state === 'liked'"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c0392b"
                    stroke-width="2"
                  >
                    <path
                      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                      fill="#c0392b"
                    />
                  </svg>
                  <svg
                    v-else
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#b91c1c"
                    stroke-width="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  <span>
                    {{ listing.state === "liked" ? "Favourited" : "Discarded" }} by
                    {{ listing.stateBy }}
                  </span>
                </div>

                <!-- Viewing -->
                <div
                  v-if="listing.viewing || (user && viewingEditorOpen)"
                  ref="viewingSectionRef"
                  class="mt-3"
                >
                  <div
                    v-if="listing.viewing && !viewingEditorOpen"
                    class="viewing-card flex items-start justify-between gap-3"
                  >
                    <div class="min-w-0">
                      <div
                        class="text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
                      >
                        Viewing scheduled
                      </div>
                      <div class="mt-1 text-[13px] font-medium text-[#222]">
                        {{ formatViewingDate(listing.viewing.scheduledAt) }}
                      </div>
                      <div class="mt-0.5 text-[11px] text-[#888]">
                        by {{ listing.viewing.scheduledBy }}
                      </div>
                      <p
                        v-if="listing.viewing.note"
                        class="m-0 mt-1.5 whitespace-pre-line text-[13px] leading-[1.5] text-[#444]"
                      >
                        {{ listing.viewing.note }}
                      </p>
                    </div>
                    <div v-if="user" class="flex flex-shrink-0 flex-col gap-1.5">
                      <button class="viewing-btn" @click="openViewingEditor">Edit</button>
                      <button class="viewing-btn viewing-btn--danger" @click="cancelViewing">
                        Cancel
                      </button>
                    </div>
                  </div>

                  <div v-if="viewingEditorOpen" class="viewing-card mt-1">
                    <div class="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                      {{ listing.viewing ? "Edit viewing" : "Schedule a viewing" }}
                    </div>
                    <input
                      v-model="viewingDateInput"
                      type="datetime-local"
                      class="viewing-date-input mt-2 block w-full min-w-0 max-w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 font-inherit text-[14px] text-[#333] outline-none focus:border-black/20 focus:bg-white"
                    />
                    <textarea
                      v-model="viewingNoteInput"
                      rows="2"
                      placeholder="Optional note (agent, contact, etc.)"
                      class="mt-2 w-full resize-none rounded-lg border border-black/10 bg-white/80 px-3 py-2 font-inherit text-[13px] text-[#333] outline-none placeholder:text-[#bbb] focus:border-black/20 focus:bg-white"
                    ></textarea>
                    <div class="mt-2 flex items-center justify-end gap-1.5">
                      <button
                        class="viewing-btn"
                        :disabled="viewingSaving"
                        @click="closeViewingEditor"
                      >
                        Cancel
                      </button>
                      <button
                        class="viewing-btn viewing-btn--primary"
                        :disabled="!viewingDateInput || viewingSaving"
                        @click="saveViewing"
                      >
                        {{
                          viewingSaving
                            ? listing.viewing
                              ? "Updating…"
                              : "Scheduling…"
                            : listing.viewing
                              ? "Update"
                              : "Schedule"
                        }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Divider -->
                <div class="my-4 h-px bg-black/6"></div>

                <!-- Notes (read-only display) -->
                <div v-if="otherNotes.length > 0" class="mt-4">
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    Notes
                  </div>
                  <div v-for="note in otherNotes" :key="note.userId" class="notes-card mt-2">
                    <div class="text-[11px] font-semibold text-[#999]">{{ note.username }}</div>
                    <p class="m-0 mt-1 whitespace-pre-line text-[13px] leading-[1.5] text-[#444]">
                      {{ note.text }}
                    </p>
                  </div>
                </div>

                <!-- Description -->
                <div v-if="displayDescription" class="mt-4">
                  <div
                    class="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]"
                  >
                    <span>Description</span>
                    <svg
                      v-if="isTranslating"
                      class="h-3 w-3 animate-spin text-[#bbb]"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-label="Translating"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-opacity="0.25"
                        stroke-width="3"
                      />
                      <path
                        d="M22 12a10 10 0 0 1-10 10"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                      />
                    </svg>
                  </div>
                  <p
                    class="m-0 mt-1.5 whitespace-pre-line text-[13px] leading-[1.6] text-[#555]"
                    :class="{ 'line-clamp-6': !descExpanded }"
                  >
                    {{ displayDescription }}
                  </p>
                  <button
                    v-if="displayDescription.length > 300"
                    class="mt-1.5 cursor-pointer border-none bg-transparent p-0 font-inherit text-[12px] font-medium text-[#999] underline decoration-[#ddd] underline-offset-2 transition-colors hover:text-[#666] hover:decoration-[#aaa]"
                    @click="descExpanded = !descExpanded"
                  >
                    {{ descExpanded ? "Show less" : "Read more" }}
                  </button>
                </div>

                <!-- Neighbourhood stats card -->
                <div
                  v-if="hasBuurtStats"
                  class="mt-4 rounded-xl border border-black/6 bg-[#f0f0ee] px-4 py-3"
                >
                  <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    Neighbourhood<template v-if="listing.neighbourhood">
                      &middot; {{ listing.neighbourhood }}</template
                    >
                  </div>
                  <div class="flex flex-col gap-1.5 text-[13px]">
                    <div
                      v-if="listing.buurtSafetyRating != null"
                      class="flex justify-between text-[#555]"
                    >
                      <span class="text-[#999]">Safety rating</span>
                      <span>{{ listing.buurtSafetyRating }} / 10</span>
                    </div>
                    <div
                      v-if="listing.buurtCrimesPer1000 != null"
                      class="flex justify-between text-[#555]"
                    >
                      <span class="text-[#999]">Crimes per 1,000</span>
                      <span>{{ listing.buurtCrimesPer1000 }}</span>
                    </div>
                  </div>
                </div>

                <!-- Nearest stations -->
                <div
                  v-if="nearestStations && nearestStations.length > 0"
                  class="mt-4 rounded-xl border border-black/6 bg-[#f0f0ee] px-4 py-3"
                >
                  <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    Nearby stations
                  </div>
                  <div class="flex flex-col gap-2">
                    <div
                      v-for="s in nearestStations"
                      :key="s.label"
                      class="flex items-center gap-3"
                    >
                      <div class="flex min-w-0 flex-col">
                        <span class="truncate text-[13px] font-medium text-[#333]">{{
                          s.name
                        }}</span>
                        <span class="text-[11px] text-[#999]"
                          >{{ s.distKm.toFixed(1) }} km &middot; {{ s.label }}</span
                        >
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Location mini map -->
                <ListingMiniMap :longitude="listing.longitude" :latitude="listing.latitude" />

                <!-- Add note link (shown when logged in, not discarded, and editor not open) -->
                <div
                  v-if="user && listing.state !== 'discarded' && !noteEditorOpen"
                  class="mt-4 border-t border-black/6 pt-4"
                >
                  <button
                    class="flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 font-inherit text-[11px] font-semibold uppercase tracking-wide text-[#888] transition-colors hover:text-[#666]"
                    @click="noteEditorOpen = true"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add note
                  </button>
                </div>
                <!-- View on source site(s) -->
                <div class="mt-4 flex flex-col gap-2 border-t border-black/6 pt-4">
                  <a
                    v-for="s in listingSources"
                    :key="s.source"
                    :href="s.url"
                    target="_blank"
                    rel="noopener"
                    class="flex w-full items-center justify-center rounded-lg bg-black/5 py-2.5 no-underline transition-colors hover:bg-black/10"
                  >
                    <img
                      v-if="s.source === 'funda'"
                      :src="fundaLogo"
                      alt="View on Funda"
                      class="h-[16px]"
                    />
                    <span v-else class="text-[13px] font-semibold tracking-wide text-[#444]">
                      View on {{ getSourceLabel(s.source) }}
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- Next arrow (desktop only) -->
          <button
            v-if="isCluster"
            class="cluster-arrow hidden flex-shrink-0 sm:flex"
            title="Next listing (→)"
            @click="navigateCluster(1)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import type { ListingState } from "@ernest/shared";
import { sourceLabel as getSourceLabel } from "@ernest/shared";
import { useListingStore } from "@/composables/useListingStore";
import { useStationStore } from "@/composables/useStationStore";
import { useAuth } from "@/composables/useAuth";
import { flyTo } from "@/composables/useMapPosition";
import { StopType } from "@/types/transit";
import PhotoGallery from "@/components/PhotoGallery.vue";
import PhotoViewer from "@/components/PhotoViewer.vue";
import ListingMiniMap from "@/components/ListingMiniMap.vue";
import fundaLogo from "@/assets/funda.svg";

const {
  selectedListing,
  closeModal,
  dismissModal,
  setState,
  saveNote,
  setViewing,
  clearViewing,
  clusterListingIds,
  currentClusterIndex,
  navigateCluster,
  analyzeCatch,
  analyzingCatchIds,
  catchErrors,
  translateDescription,
  translatingIds,
} = useListingStore();
const { user } = useAuth();
const router = useRouter();
const { stations, ensureLoaded: ensureStationsLoaded } = useStationStore();

const listing = selectedListing;
const isCluster = computed(() => clusterListingIds.value.length > 1);
const photoFullscreenOpen = ref(false);
const photoViewerIndex = ref(0);
const descExpanded = ref(false);
const modalRef = ref<HTMLDivElement>();
const ownNoteText = ref("");
const noteEditorOpen = ref(false);
const viewingEditorOpen = ref(false);
const viewingDateInput = ref("");
const viewingNoteInput = ref("");
const viewingSaving = ref(false);
const stateSaving = ref(false);
const noteSaving = ref(false);
const noteSaved = ref(false);
const scrollContainerRef = ref<HTMLDivElement>();
const viewingSectionRef = ref<HTMLDivElement>();
const linkCopied = ref(false);
let linkCopiedTimer: ReturnType<typeof setTimeout> | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let savedFadeTimer: ReturnType<typeof setTimeout> | null = null;
let prevFundaId: string | null = null;

const listingAgeText = computed(() => {
  if (!listing.value?.offeredSince) return null;
  const offered = new Date(listing.value.offeredSince);
  if (Number.isNaN(offered.getTime())) return null;
  const days = Math.floor((Date.now() - offered.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "listed today";
  if (days < 14) return `listed ${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 60) return `listed ${Math.round(days / 7)} weeks ago`;
  return `listed ${Math.round(days / 30)} months ago`;
});

const keyFacts = computed(() => {
  if (!listing.value) return "";
  const parts: string[] = [];
  if (listing.value.bedrooms) parts.push(`${listing.value.bedrooms} beds`);
  if (listing.value.livingArea) parts.push(`${listing.value.livingArea} m\u00B2`);
  if (listing.value.constructionYear) parts.push(`${listing.value.constructionYear}`);
  if (listing.value.hasGarden) parts.push("Garden");
  if (listing.value.hasBalcony) parts.push("Balcony");
  if (listing.value.hasRoofTerrace) parts.push("Roof terrace");
  if (listingAgeText.value) parts.push(listingAgeText.value);
  return parts.join(" \u00B7 ");
});

const listingAgeChip = computed(() => {
  if (!listing.value?.offeredSince) return null;
  const offered = new Date(listing.value.offeredSince);
  if (Number.isNaN(offered.getTime())) return null;
  const days = Math.floor((Date.now() - offered.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
});

const chipHasOutsideArea = computed(() => {
  const l = listing.value;
  if (!l) return false;
  return (
    l.aiHasOutsideArea === true ||
    l.hasGarden === true ||
    l.hasBalcony === true ||
    l.hasRoofTerrace === true
  );
});

const sourceLabel = computed(() => (listing.value ? getSourceLabel(listing.value.source) : ""));

const listingSources = computed(() => {
  if (!listing.value) return [];
  return listing.value.sources ?? [{ source: listing.value.source, url: listing.value.url }];
});

const energyLabelBadge = computed(() => {
  if (!listing.value) return null;
  const label = listing.value.energyLabel;
  if (!label || label.toLowerCase() === "unknown")
    return { text: "No energy label", cls: "bg-red-500/10 text-red-700" };
  if (label === "D") return { text: `Label ${label}`, cls: "bg-amber-500/10 text-amber-700" };
  return { text: `Label ${label}`, cls: "bg-emerald-500/10 text-emerald-700" };
});

const hasBuurtStats = computed(() => {
  if (!listing.value) return false;
  const l = listing.value;
  return l.buurtSafetyRating != null || l.buurtCrimesPer1000 != null;
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STATION_TYPES = [
  { type: StopType.Train, label: "Train station" },
  { type: StopType.Metro, label: "Metro station" },
  { type: StopType.Tram, label: "Tram stop" },
] as const;

const nearestStations = computed(() => {
  if (!listing.value || stations.value.length === 0) return null;
  const { latitude, longitude } = listing.value;
  return STATION_TYPES.map(({ type, label }) => {
    let nearest: { name: string; distKm: number } | null = null;
    for (const s of stations.value) {
      if (s.type !== type) continue;
      const d = haversineKm(latitude, longitude, s.lat, s.lon);
      if (!nearest || d < nearest.distKm) nearest = { name: s.name, distKm: d };
    }
    if (!nearest) return null;
    return { label, name: nearest.name, distKm: nearest.distKm };
  }).filter((s) => s !== null);
});

const isTranslating = computed(() =>
  listing.value ? translatingIds.value.has(listing.value.fundaId) : false,
);

const displayDescription = computed(() => {
  if (!listing.value) return null;
  return listing.value.descriptionEn ?? listing.value.description;
});

function formatPrice(price: number): string {
  return `\u20AC${price.toLocaleString("nl-NL")}`;
}

function copyLink() {
  navigator.clipboard.writeText(window.location.href);
  linkCopied.value = true;
  if (linkCopiedTimer) clearTimeout(linkCopiedTimer);
  linkCopiedTimer = setTimeout(() => {
    linkCopied.value = false;
  }, 2000);
}

function close() {
  // Flush any pending auto-save before closing
  if (saveDebounceTimer && listing.value && user.value && ownNoteChanged.value) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    saveNote(listing.value.fundaId, ownNoteText.value.trim(), {
      id: user.value.id,
      username: user.value.username,
    });
  }
  closeModal();
}

async function showOnMap() {
  if (!listing.value) return;
  // Flush any pending auto-save
  if (saveDebounceTimer && user.value && ownNoteChanged.value) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    saveNote(listing.value.fundaId, ownNoteText.value.trim(), {
      id: user.value.id,
      username: user.value.username,
    });
  }
  const { longitude, latitude } = listing.value;
  if (router.currentRoute.value.path !== "/") {
    // flyTo queues until MapView mounts and registers the new map
    flyTo(longitude, latitude);
    dismissModal();
    await router.push("/");
    return;
  }
  dismissModal();
  flyTo(longitude, latitude);
}

function updatePhotoUrl(index: number | null) {
  const params = new URLSearchParams(window.location.search);
  if (index != null) {
    params.set("photo", String(index));
  } else {
    params.delete("photo");
  }
  const search = params.toString();
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  history.replaceState(null, "", url);
}

function openPhotoViewer(index: number) {
  photoViewerIndex.value = index;
  photoFullscreenOpen.value = true;
  updatePhotoUrl(index);
}

function closePhotoViewer() {
  photoFullscreenOpen.value = false;
  updatePhotoUrl(null);
  nextTick(() => {
    modalRef.value?.focus();
  });
}

function onPhotoViewerSelect(index: number) {
  photoViewerIndex.value = index;
  updatePhotoUrl(index);
}

// Find own note and track if it changed
const ownNote = computed(() => {
  if (!listing.value || !user.value) return null;
  return listing.value.notes.find((n) => n.userId === user.value!.id) ?? null;
});

const ownNoteChanged = computed(() => {
  const original = ownNote.value?.text ?? "";
  return ownNoteText.value.trim() !== original;
});

// Notes from other users (own note is shown in the inline editor)
const otherNotes = computed(() => {
  if (!listing.value) return [];
  if (!user.value) return listing.value.notes;
  return listing.value.notes.filter((n) => n.userId !== user.value!.id);
});

const catchAnalyzing = computed(() =>
  listing.value ? analyzingCatchIds.value.has(listing.value.fundaId) : false,
);

const catchSectionVisible = computed(() => {
  if (!listing.value) return false;
  if (catchAnalyzing.value) return true;
  const c = listing.value.aiCatch;
  if (c != null && c.length > 0) return true;
  return false;
});

function catchDotClass(severity: string): string {
  if (severity === "high") return "catch-dot--high";
  if (severity === "medium") return "catch-dot--medium";
  return "catch-dot--low";
}

const catchSkeletonWidths = ["80%", "65%", "72%"];

function toIsoFromLocalInput(local: string): string {
  // datetime-local value is "YYYY-MM-DDTHH:MM" interpreted as local time
  return new Date(local).toISOString();
}

function toLocalInputFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const viewingDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatViewingDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return viewingDateFormatter.format(d);
}

function defaultViewingDateInput(): string {
  // Default to tomorrow 14:00 local
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(14, 0, 0, 0);
  return toLocalInputFromIso(d.toISOString());
}

function openViewingEditor() {
  if (!listing.value) return;
  const v = listing.value.viewing;
  viewingDateInput.value = v ? toLocalInputFromIso(v.scheduledAt) : defaultViewingDateInput();
  viewingNoteInput.value = v?.note ?? "";
  viewingEditorOpen.value = true;
  nextTick(() => {
    viewingSectionRef.value?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function closeViewingEditor() {
  viewingEditorOpen.value = false;
}

async function saveViewing() {
  if (!listing.value || !user.value || !viewingDateInput.value) return;
  let iso: string;
  try {
    iso = toIsoFromLocalInput(viewingDateInput.value);
  } catch {
    return;
  }
  const { fundaId } = listing.value;
  const note = viewingNoteInput.value.trim();
  viewingSaving.value = true;
  try {
    // setViewing optimistically sets state='viewing' and clears old state
    await setViewing(fundaId, iso, note === "" ? null : note, user.value.username);
    viewingEditorOpen.value = false;
  } catch {
    // optimistic update already rolled back; keep editor open so the user can retry
  } finally {
    viewingSaving.value = false;
  }
}

async function cancelViewing() {
  if (!listing.value) return;
  try {
    await clearViewing(listing.value.fundaId);
  } catch {
    // rollback already happened
  }
}

async function toggleState(newState: ListingState) {
  if (!listing.value || !user.value) return;
  const { fundaId, state: cur } = listing.value;
  const next: ListingState | null = cur === newState ? null : newState;
  stateSaving.value = true;
  try {
    await setState(fundaId, next, user.value.username);
    if (next === "discarded") noteEditorOpen.value = true;
  } catch {
    // optimistic update already rolled back
  } finally {
    stateSaving.value = false;
  }
}

// Auto-save note on text change (debounced 1s)
watch(ownNoteText, () => {
  if (!listing.value || !user.value || !ownNoteChanged.value) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  if (savedFadeTimer) {
    clearTimeout(savedFadeTimer);
    savedFadeTimer = null;
  }
  noteSaved.value = false;

  saveDebounceTimer = setTimeout(async () => {
    saveDebounceTimer = null;
    if (!listing.value || !user.value || !ownNoteChanged.value) return;

    noteSaving.value = true;
    await saveNote(listing.value.fundaId, ownNoteText.value.trim(), {
      id: user.value.id,
      username: user.value.username,
    });
    noteSaving.value = false;
    noteSaved.value = true;
    savedFadeTimer = setTimeout(() => {
      noteSaved.value = false;
    }, 2000);
  }, 1000);
});

// Reset state only when switching to a different listing (not on data updates)
watch(
  listing,
  (v) => {
    const newId = v?.fundaId ?? null;
    if (newId === prevFundaId) return;
    prevFundaId = newId;

    descExpanded.value = false;
    noteEditorOpen.value = false;
    viewingEditorOpen.value = false;
    viewingDateInput.value = "";
    viewingNoteInput.value = "";

    // Lazy-trigger AI catch analysis when an authed user opens an unanalyzed listing
    if (
      v &&
      user.value &&
      v.aiCatch === null &&
      (v.status === "Beschikbaar" || v.status === "") &&
      !analyzingCatchIds.value.has(v.fundaId) &&
      !catchErrors.value.has(v.fundaId)
    ) {
      void analyzeCatch(v.fundaId);
    }

    // Lazy-trigger description translation if we have a Dutch description but no English yet
    if (
      v &&
      user.value &&
      v.descriptionEn === null &&
      v.description != null &&
      v.description.trim().length > 0 &&
      (v.status === "Beschikbaar" || v.status === "") &&
      !translatingIds.value.has(v.fundaId)
    ) {
      void translateDescription(v.fundaId);
    }

    // Scroll inner content back to top when switching listings
    scrollContainerRef.value?.scrollTo({ top: 0 });

    // Read photo deep-link param
    const photoParam = new URLSearchParams(window.location.search).get("photo");
    if (v && photoParam != null) {
      const idx = parseInt(photoParam, 10);
      if (!Number.isNaN(idx) && idx >= 0 && idx < v.photos.length) {
        photoViewerIndex.value = idx;
        photoFullscreenOpen.value = true;
      } else {
        photoViewerIndex.value = 0;
        photoFullscreenOpen.value = false;
      }
    } else {
      photoViewerIndex.value = 0;
      photoFullscreenOpen.value = false;
    }
    noteSaving.value = false;
    noteSaved.value = false;
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    if (savedFadeTimer) {
      clearTimeout(savedFadeTimer);
      savedFadeTimer = null;
    }
    if (v && user.value) {
      const note = v.notes.find((n) => n.userId === user.value!.id);
      ownNoteText.value = note?.text ?? "";
      // Show note editor if user has a note or has discarded
      if (note || v.state === "discarded") noteEditorOpen.value = true;
    } else {
      ownNoteText.value = "";
    }
  },
  { immediate: true },
);

// Focus the modal panel itself when it opens (keeps focus trap working without
// showing a visible focus ring on the first button/image)
watch(listing, (v, oldV) => {
  if (v && !oldV && !photoFullscreenOpen.value) {
    nextTick(() => {
      modalRef.value?.focus();
    });
  }
  if (v) void ensureStationsLoaded();
});

// Global keyboard listener (Escape to close, Left/Right for cluster nav)
function onGlobalKeydown(e: KeyboardEvent) {
  if (photoFullscreenOpen.value) return;
  if (e.key === "Escape") close();
  if (isCluster.value) {
    if (e.key === "ArrowLeft") navigateCluster(-1);
    if (e.key === "ArrowRight") navigateCluster(1);
  }
}

watch(listing, (v) => {
  if (v) {
    window.addEventListener("keydown", onGlobalKeydown);
  } else {
    window.removeEventListener("keydown", onGlobalKeydown);
  }
});

// Lock body scroll when modal is open
watch(listing, (v) => {
  if (v) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

function trapFocus(e: KeyboardEvent) {
  if (e.key !== "Tab" || !modalRef.value) return;
  const focusable = modalRef.value.querySelectorAll<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
</script>

<style scoped>
.notes-card {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.12);
}

.note-editor {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.12);
}

.viewing-card {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.07);
  border: 1px solid rgba(16, 185, 129, 0.18);
}

.viewing-btn {
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 500;
  color: #555;
  cursor: pointer;
  transition: background 0.15s ease;
}

.viewing-btn:hover {
  background: rgba(255, 255, 255, 0.95);
}

.viewing-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.viewing-btn--primary {
  background: #047857;
  border-color: #047857;
  color: white;
}

.viewing-btn--primary:hover {
  background: #065f46;
}

.viewing-btn--danger:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  border-color: rgba(220, 38, 38, 0.2);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(6px);
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.2;
  white-space: nowrap;
}

.chip--green {
  color: #4ade80;
}

.chip--blue {
  color: #7dd3fc;
}

.catch-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.catch-dot--high {
  background: #dc2626;
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.18);
}

.catch-dot--medium {
  background: #d97706;
  box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.18);
}

.catch-dot--low {
  background: #9ca3af;
  box-shadow: 0 0 0 2px rgba(156, 163, 175, 0.18);
}

.catch-skeleton-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  animation: catch-skeleton-pulse 1.4s ease-in-out infinite;
}

.catch-skeleton-bar {
  display: inline-block;
  height: 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  animation: catch-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes catch-skeleton-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

/* Reset iOS Safari's oversized native datetime-local rendering */
.viewing-date-input {
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
  line-height: 1.4;
}

.viewing-date-input::-webkit-date-and-time-value {
  text-align: left;
  min-height: 1.4em;
}

.reaction-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.03);
  font-size: 12px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

@media (max-width: 639px) {
  .reaction-btn {
    padding: 10px 16px;
    font-size: 13px;
    border-radius: 10px;
  }
}

.reaction-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.reaction-btn--active {
  border-color: transparent;
}

.reaction-btn--fav {
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
  border-color: rgba(192, 57, 43, 0.2);
}

.reaction-btn--fav:hover {
  background: rgba(192, 57, 43, 0.18);
}

.reaction-btn--discard {
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
  border-color: rgba(220, 38, 38, 0.18);
}

.reaction-btn--discard:hover {
  background: rgba(220, 38, 38, 0.14);
}

.reaction-btn--viewing {
  background: rgba(16, 185, 129, 0.1);
  color: #047857;
  border-color: rgba(16, 185, 129, 0.25);
}

.reaction-btn--viewing:hover {
  background: rgba(16, 185, 129, 0.16);
}

.reaction-btn--applied {
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  border-color: rgba(59, 130, 246, 0.25);
}

.reaction-btn--applied:hover {
  background: rgba(59, 130, 246, 0.16);
}

.cluster-arrow {
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.cluster-arrow:hover {
  background: rgba(0, 0, 0, 0.6);
}

.icon-swap-enter-active,
.icon-swap-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.icon-swap-enter-from {
  opacity: 0;
  transform: scale(0.4);
}

.icon-swap-leave-to {
  opacity: 0;
  transform: scale(0.4);
}

/* Slide-up on mobile, scale-fade on desktop */
.listing-modal-enter-active,
.listing-modal-leave-active {
  transition: opacity 0.25s ease;
}

.listing-modal-enter-active .listing-panel,
.listing-modal-leave-active .listing-panel {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}

.listing-modal-enter-from,
.listing-modal-leave-to {
  opacity: 0;
}

/* Mobile: slide up */
.listing-modal-enter-from .listing-panel,
.listing-modal-leave-to .listing-panel {
  transform: translateY(100%);
  opacity: 1;
}

/* Desktop: scale-fade */
@media (min-width: 640px) {
  .listing-modal-enter-from .listing-panel,
  .listing-modal-leave-to .listing-panel {
    transform: scale(0.96) translateY(8px);
    opacity: 0;
  }
}

.photo-viewer-enter-active,
.photo-viewer-leave-active {
  transition: opacity 0.18s ease;
}

.photo-viewer-enter-from,
.photo-viewer-leave-to {
  opacity: 0;
}
</style>
