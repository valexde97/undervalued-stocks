import { Formik, Form, Field, ErrorMessage, FormikProps  } from "formik";
import * as Yup from "yup";

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
    minPrice: '',
    maxPrice: '',
    category: '',
    sortBy: '',
  };

  const validationSchema = Yup.object({
    minPrice: Yup.number().positive('Must be positive').nullable(),
    maxPrice: Yup.number().positive('Must be positive').nullable(),
    category: Yup.string(),
    sortBy: Yup.string(),
  });

  const onSubmit = (values: FilterValues) => {
    onFilter(values);
  };

  return (
    <div style={{ padding: "1rem", border: "1px solid #ccc", borderRadius: "8px", margin: "1rem 0" }}>
      <h3>Filter Stocks</h3>
      <Formik
        innerRef={formikRef}
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={onSubmit}
      >
        <Form>
          <div>
            <label>Sort By: </label>
            <Field name="sortBy" as="select">
              <option value="">None</option>
              <option value="priceAsc">Price (Low to High)</option>
              <option value="priceDesc">Price (High to Low)</option>
              <option value="nameAsc">Name (A to Z)</option>
              <option value="nameDesc">Name (Z to A)</option>
            </Field>
          </div>

          <div>
            <label>Min Price: </label>
            <Field name="minPrice" type="number" />
            <ErrorMessage name="minPrice">{(msg) => <div style={{ color: "red" }}>{msg}</div>}</ErrorMessage>
          </div>

          <div>
            <label>Max Price: </label>
            <Field name="maxPrice" type="number" />
            <ErrorMessage name="maxPrice">{(msg) => <div style={{ color: "red" }}>{msg}</div>}</ErrorMessage>
          </div>

          <div>
            <label>Category: </label>
            <Field name="category" as="select">
              <option value="">Select</option>
              <option value="small">Small Cap</option>
              <option value="mid">Mid Cap</option>
              <option value="large">Large Cap</option>
            </Field>
            <ErrorMessage name="category">{(msg) => <div style={{ color: "red" }}>{msg}</div>}</ErrorMessage>
          </div>

          <button type="submit" style={{ marginTop: "1rem" }}>
            Apply Filter
          </button>
        </Form>
      </Formik>
    </div>
  );
};
