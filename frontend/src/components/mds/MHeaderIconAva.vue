<script setup>
/**
 * MHeaderIconAva — icon mascot MISA AI (AVA), asset full-color CỐ ĐỊNH.
 * Path SVG lấy đúng từ bản demo chuẩn của giám đốc thiết kế (Figma node
 * 20062:2582): nền gradient kim cương cyan #37E1FF → xanh #2B67FF, viền trắng
 * 60% opacity, mặt mascot (2 mắt gradient xanh + khoang miệng navy đậm + nụ
 * cười trắng). KHÔNG tự vẽ lại/tint theo màu khác — xem
 * references/patterns/header-bar.md mục 3c.
 */
defineProps({ size: { type: [Number, String], default: 24 } })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="mds-ava-bg-clip">
        <path d="M1.5 13.5C1.5 6.87258 6.87258 1.5 13.5 1.5V1.5C20.1274 1.5 25.5 6.87258 25.5 13.5V13.5C25.5 20.1274 20.1274 25.5 13.5 25.5V25.5C6.87258 25.5 1.5 20.1274 1.5 13.5V13.5Z" />
      </clipPath>
      <linearGradient id="mds-ava-diamond" x1="0" y1="0" x2="500" y2="500" gradientUnits="userSpaceOnUse">
        <stop stop-color="#37E1FF" />
        <stop offset="1" stop-color="#2B67FF" />
      </linearGradient>
      <linearGradient id="mds-ava-re1" x1="20.8835" y1="8.36648" x2="16.6174" y2="12.6325" gradientUnits="userSpaceOnUse">
        <stop stop-color="#EEF6FF" />
        <stop offset="1" stop-color="#DEEDFF" />
      </linearGradient>
      <radialGradient id="mds-ava-re2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(18.7508 10.4987) rotate(180) scale(2.39168)">
        <stop stop-color="white" />
        <stop offset="1" stop-color="#DEEDFF" />
      </radialGradient>
      <linearGradient id="mds-ava-re3" x1="17.2216" y1="12.0308" x2="20.2632" y2="8.9893" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3D97FF" />
        <stop offset="1" stop-color="#E9F3FF" />
      </linearGradient>
      <linearGradient id="mds-ava-le1" x1="6.11647" y1="8.36648" x2="10.3825" y2="12.6325" gradientUnits="userSpaceOnUse">
        <stop stop-color="#EEF6FF" />
        <stop offset="1" stop-color="#DEEDFF" />
      </linearGradient>
      <radialGradient id="mds-ava-le2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(8.24878 10.4987) scale(2.39168)">
        <stop stop-color="white" />
        <stop offset="1" stop-color="#DEEDFF" />
      </radialGradient>
      <linearGradient id="mds-ava-le3" x1="9.77795" y1="12.0308" x2="6.73642" y2="8.9893" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3D97FF" />
        <stop offset="1" stop-color="#E9F3FF" />
      </linearGradient>
      <linearGradient id="mds-ava-face" x1="13.4996" y1="8.23594" x2="13.4996" y2="20.2719" gradientUnits="userSpaceOnUse">
        <stop stop-color="white" />
        <stop offset="1" stop-color="#DEEDFF" />
      </linearGradient>
      <radialGradient id="mds-ava-iris" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(13.4547 15.0216) rotate(-0.335306) scale(5.96329 3.97631)">
        <stop stop-color="#0A1496" />
        <stop offset="1" stop-color="#020D42" />
      </radialGradient>
      <radialGradient id="mds-ava-rp" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(16.1233 14.6156) scale(2.24999)">
        <stop offset="0.55" stop-color="#003CD5" />
        <stop offset="1" stop-color="#003CD5" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="mds-ava-lp" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.8756 14.6156) scale(2.24999)">
        <stop offset="0.55" stop-color="#003CD5" />
        <stop offset="1" stop-color="#003CD5" stop-opacity="0" />
      </radialGradient>
    </defs>

    <g clip-path="url(#mds-ava-bg-clip)">
      <g transform="matrix(0.00775 0.01525 -0.0123896 0.00629635 17.75 16.75)">
        <rect x="0" y="0" width="1343.02" height="1472.73" fill="url(#mds-ava-diamond)" shape-rendering="crispEdges" />
        <rect x="0" y="0" width="1343.02" height="1472.73" transform="scale(1 -1)" fill="url(#mds-ava-diamond)" shape-rendering="crispEdges" />
        <rect x="0" y="0" width="1343.02" height="1472.73" transform="scale(-1 1)" fill="url(#mds-ava-diamond)" shape-rendering="crispEdges" />
        <rect x="0" y="0" width="1343.02" height="1472.73" transform="scale(-1)" fill="url(#mds-ava-diamond)" shape-rendering="crispEdges" />
      </g>
    </g>

    <path d="M13.5 0.75C20.5416 0.75 26.25 6.45837 26.25 13.5C26.25 20.5416 20.5416 26.25 13.5 26.25C6.45837 26.25 0.75 20.5416 0.75 13.5C0.75 6.45837 6.45837 0.75 13.5 0.75Z" stroke="white" stroke-opacity="0.6" stroke-width="1.5" />

    <path d="M18.75 13.5C20.4068 13.5 21.75 12.1568 21.75 10.5C21.75 8.84312 20.4068 7.5 18.75 7.5C17.0931 7.5 15.75 8.84312 15.75 10.5C15.75 12.1568 17.0931 13.5 18.75 13.5Z" fill="url(#mds-ava-re1)" />
    <path d="M18.7508 12.8904C20.0717 12.8904 21.1424 11.8196 21.1424 10.4987C21.1424 9.1778 20.0717 8.10703 18.7508 8.10703C17.4299 8.10703 16.3591 9.1778 16.3591 10.4987C16.3591 11.8196 17.4299 12.8904 18.7508 12.8904Z" fill="url(#mds-ava-re2)" />
    <path d="M18.7518 12.7232C19.9793 12.7232 20.9744 11.7282 20.9744 10.5007C20.9744 9.27321 19.9793 8.27813 18.7518 8.27813C17.5243 8.27813 16.5293 9.27321 16.5293 10.5007C16.5293 11.7282 17.5243 12.7232 18.7518 12.7232Z" fill="url(#mds-ava-re3)" />

    <path d="M8.25 13.5C6.59314 13.5 5.25 12.1568 5.25 10.5C5.25 8.84312 6.59314 7.5 8.25 7.5C9.90685 7.5 11.25 8.84312 11.25 10.5C11.25 12.1568 9.90685 13.5 8.25 13.5Z" fill="url(#mds-ava-le1)" />
    <path d="M8.24878 12.8904C6.92788 12.8904 5.85709 11.8196 5.85709 10.4987C5.85709 9.1778 6.92788 8.10703 8.24878 8.10703C9.56966 8.10703 10.6404 9.1778 10.6404 10.4987C10.6404 11.8196 9.56966 12.8904 8.24878 12.8904Z" fill="url(#mds-ava-le2)" />
    <path d="M8.24777 12.7232C7.02031 12.7232 6.02524 11.7282 6.02524 10.5007C6.02524 9.27321 7.02031 8.27813 8.24777 8.27813C9.47528 8.27813 10.4703 9.27321 10.4703 10.5007C10.4703 11.7282 9.47528 12.7232 8.24777 12.7232Z" fill="url(#mds-ava-le3)" />

    <path d="M14.6246 8.26406H12.3746C9.06088 8.26406 6.3746 10.9503 6.3746 14.264V14.2641C6.3746 17.5778 9.06088 20.264 12.3746 20.264H14.6246C17.9383 20.264 20.6246 17.5778 20.6246 14.2641V14.264C20.6246 10.9503 17.9383 8.26406 14.6246 8.26406Z" fill="url(#mds-ava-face)" />

    <path d="M15.7492 11.6531H11.2492C9.38527 11.6531 7.87424 13.1642 7.87424 15.0281C7.87424 16.8921 9.38527 18.4031 11.2492 18.4031H15.7492C17.6132 18.4031 19.1242 16.8921 19.1242 15.0281C19.1242 13.1642 17.6132 11.6531 15.7492 11.6531Z" fill="url(#mds-ava-iris)" />

    <path d="M16.1233 16.8656C17.366 16.8656 18.3733 15.8582 18.3733 14.6156C18.3733 13.373 17.366 12.3656 16.1233 12.3656C14.8807 12.3656 13.8734 13.373 13.8734 14.6156C13.8734 15.8582 14.8807 16.8656 16.1233 16.8656Z" fill="url(#mds-ava-rp)" style="mix-blend-mode:screen" />
    <path d="M16.1243 16.1545C16.9731 16.1545 17.6613 15.4664 17.6613 14.6175C17.6613 13.7686 16.9731 13.0805 16.1243 13.0805C15.2754 13.0805 14.5872 13.7686 14.5872 14.6175C14.5872 15.4664 15.2754 16.1545 16.1243 16.1545Z" fill="white" />
    <path d="M16.1236 15.7101C16.7268 15.7101 17.2158 15.2211 17.2158 14.6179C17.2158 14.0147 16.7268 13.5258 16.1236 13.5258C15.5205 13.5258 15.0315 14.0147 15.0315 14.6179C15.0315 15.2211 15.5205 15.7101 16.1236 15.7101Z" fill="#071235" />
    <path d="M16.4756 14.1146C16.5173 14.0107 16.6138 13.9409 16.7437 13.957C16.8929 13.9753 16.993 14.1036 17.0488 14.234C17.1417 14.4509 17.1453 14.7049 17.0587 14.9245C16.8501 15.4534 16.0943 15.7319 15.6223 15.372C15.5128 15.2886 15.407 15.1613 15.4054 15.0163C15.4028 14.8103 15.5952 14.7769 15.7616 14.7837C15.964 14.792 16.1898 14.8583 16.3525 14.6961C16.4866 14.5626 16.4579 14.416 16.4527 14.2475C16.4511 14.2001 16.4589 14.1542 16.4756 14.114V14.1146Z" fill="#2C3553" />
    <path d="M16.137 14.8429C16.4832 14.8429 16.7639 14.5622 16.7639 14.216C16.7639 13.8697 16.4832 13.5891 16.137 13.5891C15.7908 13.5891 15.5101 13.8697 15.5101 14.216C15.5101 14.5622 15.7908 14.8429 16.137 14.8429Z" fill="white" />
    <path d="M15.367 15.0064C15.4969 15.0064 15.6022 14.9011 15.6022 14.7712C15.6022 14.6413 15.4969 14.5359 15.367 14.5359C15.2371 14.5359 15.1318 14.6413 15.1318 14.7712C15.1318 14.9011 15.2371 15.0064 15.367 15.0064Z" fill="white" />

    <path d="M10.8756 16.8656C12.1183 16.8656 13.1256 15.8582 13.1256 14.6156C13.1256 13.373 12.1183 12.3656 10.8756 12.3656C9.63301 12.3656 8.62564 13.373 8.62564 14.6156C8.62564 15.8582 9.63301 16.8656 10.8756 16.8656Z" fill="url(#mds-ava-lp)" style="mix-blend-mode:screen" />
    <path d="M10.8757 16.1545C11.7246 16.1545 12.4127 15.4664 12.4127 14.6175C12.4127 13.7686 11.7246 13.0805 10.8757 13.0805C10.0269 13.0805 9.33871 13.7686 9.33871 14.6175C9.33871 15.4664 10.0269 16.1545 10.8757 16.1545Z" fill="white" />
    <path d="M10.8753 15.7101C11.4785 15.7101 11.9674 15.2211 11.9674 14.6179C11.9674 14.0147 11.4785 13.5258 10.8753 13.5258C10.2721 13.5258 9.78314 14.0147 9.78314 14.6179C9.78314 15.2211 10.2721 15.7101 10.8753 15.7101Z" fill="#071235" />
    <path d="M11.2278 14.1146C11.2695 14.0107 11.366 13.9409 11.4959 13.957C11.6451 13.9753 11.7452 14.1036 11.801 14.234C11.8938 14.4509 11.8975 14.7049 11.8109 14.9245C11.6023 15.4534 10.8465 15.7319 10.3745 15.372C10.265 15.2886 10.1592 15.1613 10.1576 15.0163C10.155 14.8103 10.3474 14.7769 10.5138 14.7837C10.7162 14.792 10.942 14.8583 11.1047 14.6961C11.2388 14.5626 11.2101 14.416 11.2049 14.2475C11.2033 14.2001 11.2111 14.1542 11.2278 14.114V14.1146Z" fill="#2C3553" />
    <path d="M10.8885 14.8429C11.2347 14.8429 11.5154 14.5622 11.5154 14.216C11.5154 13.8697 11.2347 13.5891 10.8885 13.5891C10.5423 13.5891 10.2616 13.8697 10.2616 14.216C10.2616 14.5622 10.5423 14.8429 10.8885 14.8429Z" fill="white" />
    <path d="M10.1192 15.0064C10.2491 15.0064 10.3544 14.9011 10.3544 14.7712C10.3544 14.6413 10.2491 14.5359 10.1192 14.5359C9.9893 14.5359 9.884 14.6413 9.884 14.7712C9.884 14.9011 9.9893 15.0064 10.1192 15.0064Z" fill="white" />

    <path d="M13.5119 17.64C12.7541 17.64 12.2903 17.2335 12.2711 17.2163C12.1666 17.123 12.1575 16.9628 12.2508 16.8584C12.3435 16.7545 12.5032 16.7453 12.6076 16.8371C12.6238 16.8513 12.9574 17.1331 13.5119 17.1331C14.0664 17.1331 14.3645 16.8614 14.3761 16.8498C14.4724 16.7484 14.6321 16.7459 14.7335 16.8427C14.8349 16.9395 14.8374 17.1007 14.7405 17.2021C14.7233 17.2198 14.3133 17.64 13.5119 17.64Z" fill="white" />
  </svg>
</template>
