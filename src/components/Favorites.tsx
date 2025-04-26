import { motion } from "framer-motion";

export const Favorites = () => (
  <motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
>
    <div>
      <h2>Favorites</h2>
      <p>This page will be able soon to show your saved stocks.</p>
    </div>
   </motion.div>
  );

