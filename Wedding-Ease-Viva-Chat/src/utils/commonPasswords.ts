const LIST: readonly string[] = [
  "password", "123456", "12345678", "qwerty", "abc123", "111111", "iloveyou",
  "admin", "welcome", "monkey", "dragon", "letmein", "sunshine", "princess",
  "password1", "qwerty123", "1q2w3e4r", "football", "baseball", "trustno1",
  "master", "hello", "freedom", "whatever", "shadow", "superman", "batman",
  "starwars", "passw0rd", "p@ssw0rd", "123qwe", "qazwsx", "loveme", "changeme",
  "access", "hottie", "lovely", "bailey", "michael", "ashley", "jessica",
  "charlie", "nicole", "jennifer", "jordan", "thomas", "hunter", "ranger",
  "harley", "buster", "joshua", "maggie", "123123", "121212", "000000",
  "654321", "777777", "888888", "987654321", "qwertyuiop", "asdfghjkl",
  "zxcvbnm", "qazwsxedc", "11111111", "1234567890", "1q2w3e", "qwerty1",
  "q1w2e3r4", "!qaz2wsx", "pokemon", "mustang", "corvette", "diamond",
  "silver", "internet", "service", "computer", "login", "chocolate", "cookie",
  "flower", "sunshine1", "summer", "winter", "blessed", "forever", "iloveyou1",
  "password123", "welcome1", "welcome123", "admin123", "admin1", "root",
  "toor", "test", "test123", "guest", "demo", "oracle", "changeme1",
  "letmein1", "nopass", "passpass", "secret", "secret1", "myspace1", "yahoo",
  "google", "facebook", "twitter", "instagram", "snapchat", "whatsapp",
  "123abc", "abcd1234", "abcdef", "asdf", "asdf1234", "asdfasdf", "iloveu",
  "babygirl", "babyboy", "tiger", "dolphin", "falcon", "phoenix", "merlin",
  "gandalf", "frodo", "legolas", "matrix", "neo", "trinity", "skywalker",
  "anakin", "darthvader", "captain", "america", "spiderman", "ironman",
  "hulk", "thor", "loki", "scarlet", "wedding", "bride", "groom", "marriage",
  "forever1", "weddingease", "easebot", "india123", "delhi", "mumbai",
  "bangalore", "chennai", "hyderabad", "pune", "kolkata", "ahmedabad",
  "jaipur", "lucknow", "cricket", "cricket1", "sachin", "virat", "bollywood",
  "namaste", "shanti", "krishna", "ganesha", "rama", "shiva", "lakshmi",
  "priya", "rahul", "amit", "deepak", "sunil", "anita", "pooja", "sneha",
  "kavita", "neha", "ravi", "ramesh", "suresh", "rajesh", "manish", "vikas",
  "rohit", "ankit", "abhishek", "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday", "january", "february", "march", "april",
  "june", "july", "august", "september", "october", "november", "december",
  "spring", "autumn", "fall", "2024", "2025", "2026", "2023", "2022", "2021",
  "2020", "love", "loveyou", "kisses", "cupcake", "angel", "beautiful",
  "pretty", "yellow", "purple", "orange", "green", "blue", "black", "white",
  "red", "pink", "rainbow", "happy", "smile",
];

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(LIST);

export function isCommonPassword(pw: string): boolean {
  return COMMON_PASSWORDS.has(pw.toLowerCase());
}
