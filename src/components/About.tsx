import { motion } from "framer-motion";

export const About = () => (
  <motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
>
  <div>
    <h2>About This Project</h2>
    <p>
      This app helps you find undervalued stocks based on Peter Lynch strategy.
    </p>
  </div>
  </motion.div>
);
