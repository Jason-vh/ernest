import { createRouter, createWebHistory } from "vue-router";
import MapView from "@/components/MapView.vue";
import { useAuth, authReady } from "@/composables/useAuth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: MapView },
    {
      path: "/activity",
      component: () => import("@/components/ActivityPage.vue"),
    },
    {
      path: "/viewings",
      component: () => import("@/components/ViewingsPage.vue"),
    },
    {
      path: "/manage",
      component: () => import("@/components/ManagePage.vue"),
      beforeEnter: async () => {
        await authReady;
        const { user } = useAuth();
        if (!user.value) return "/";
      },
    },
  ],
});

export default router;
