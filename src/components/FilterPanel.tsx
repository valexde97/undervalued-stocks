import { Formik, Form, Field, ErrorMessage, FormikProps } from "formik";
import * as Yup from "yup";
import styles from "./FilterPanel.module.css";

type FilterValues = {
  minPrice: number | "";
  maxPrice: number | "";
  category: string;
  sortBy: string;
};

type FilterPanelProps = {
  onFilter: (values: FilterValues) => void;
  formikRef: React.RefObject<FormikProps<FilterValues> | null>;
};

export const FilterPanel = ({ onFilter, formikRef }: FilterPanelProps) => {
  const initialValues: FilterValues = {
    minPrice: "",
    maxPrice: "",
    category: "",
    sortBy: "",
  };

  const validationSchema = Yup.object({
    minPrice: Yup.number().positive("Must be positive").nullable(),
    maxPrice: Yup.number().positive("Must be positive").nullable(),
    category: Yup.string(),
    sortBy: Yup.string(),
  });

  const onSubmit = (values: FilterValues) => {
    onFilter(values);
  };

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>🔍 Filter Stocks</h3>
      <Formik
        innerRef={formikRef}
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={onSubmit}
      >
        <Form>
          <div className={styles.formField}>
            <label>Sort By: </label>
            <Field name="sortBy" as="select">
              <option value="">None</option>
              <option value="priceAsc">Price (Low to High)</option>
              <option value="priceDesc">Price (High to Low)</option>
              <option value="nameAsc">Name (A to Z)</option>
              <option value="nameDesc">Name (Z to A)</option>
            </Field>
          </div>

          <div className={styles.formField}>
            <label>Min Price: </label>
            <Field name="minPrice" type="number" />
            <ErrorMessage
              name="minPrice"
              component="div"
              className={styles.errorMessage}
            />
          </div>

          <div className={styles.formField}>
            <label>Max Price: </label>
            <Field name="maxPrice" type="number" />
            <ErrorMessage
              name="maxPrice"
              component="div"
              className={styles.errorMessage}
            />
          </div>

          <div className={styles.formField}>
            <label>Category: </label>
            <Field name="category" as="select">
              <option value="">Select</option>
              <option value="small">Small Cap</option>
              <option value="mid">Mid Cap</option>
              <option value="large">Large Cap</option>
            </Field>
            <ErrorMessage
              name="category"
              component="div"
              className={styles.errorMessage}
            />
          </div>

          <button type="submit" className={styles.applyButton}>
            Apply Filter
          </button>
        </Form>
      </Formik>
    </div>
  );
};
