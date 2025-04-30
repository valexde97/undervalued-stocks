import { Formik, Form, Field, ErrorMessage, FormikProps } from "formik";
import * as Yup from "yup";
import styles from "./filterPanel.module.css";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  
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
      <h3 className={styles.panelTitle}>{t("filter.title")}</h3>
      <Formik
        innerRef={formikRef}
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={onSubmit}
      >
        <Form>
          <div className={styles.formField}>
            <label>{t("filter.sortBy")}:</label>
            <Field name="sortBy" as="select">
              <option value="">{t("filter.none")}</option>
              <option value="priceAsc">{t("filter.priceAsc")}</option>
              <option value="priceDesc">{t("filter.priceDesc")}</option>
              <option value="nameAsc">{t("filter.nameAsc")}</option>
              <option value="nameDesc">{t("filter.nameDesc")}</option>
            </Field>
          </div>

          <div className={styles.formField}>
            <label>{t("filter.minPrice")}:</label>
            <Field name="minPrice" type="number" />
            <ErrorMessage name="minPrice" component="div" className={styles.errorMessage} />
          </div>

          <div className={styles.formField}>
            <label>{t("filter.maxPrice")}:</label>
            <Field name="maxPrice" type="number" />
            <ErrorMessage name="maxPrice" component="div" className={styles.errorMessage} />
          </div>

          <div className={styles.formField}>
            <label>{t("filter.category")}:</label>
            <Field name="category" as="select">
              <option value="">{t("filter.select")}</option>
              <option value="small">{t("filter.small")}</option>
              <option value="mid">{t("filter.mid")}</option>
              <option value="large">{t("filter.large")}</option>
            </Field>
            <ErrorMessage name="category" component="div" className={styles.errorMessage} />
          </div>

          <button type="submit" className={styles.applyButton}>
            {t("filter.apply")}
          </button>
        </Form>
      </Formik>
    </div>
  );
};
