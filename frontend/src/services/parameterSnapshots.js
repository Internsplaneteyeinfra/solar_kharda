import axios from 'axios'

export async function fetchParameterSnapshot({ apiBase, parameter, startDate, endDate }) {
  if (!apiBase) {
    throw new Error('API base URL is required.')
  }
  if (!parameter) {
    throw new Error('Parameter is required.')
  }
  if (!startDate || !endDate) {
    throw new Error('Start and end dates are required.')
  }

  const response = await axios.get(`${apiBase}/api/panel-parameter-snapshot`, {
    params: {
      parameter,
      start_date: startDate,
      end_date: endDate
    },
    timeout: 120000
  })

  return response.data
}







