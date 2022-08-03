import re
import requests
import sqlite3

conn = sqlite3.connect("catalogue.sqlite.db")
cursor = conn.cursor()

cursor.execute("SELECT BookName, ISBN10, ISBN13 FROM Books")
isbns = cursor.fetchall()

for book_name, isbn10, isbn13 in isbns:
	response_text = requests.post(f"https://isbnsearch.org/isbn/{isbn10}").text
	if "Page Not Found" in response_text:
		print("-------------------------------------------------")
		print(f"{book_name} has incorrect ISBN10")
	response_text = requests.post(f"https://isbnsearch.org/isbn/{isbn13}").text
	if "Page Not Found" in response_text:
		print("-------------------------------------------------")
		print(f"{book_name} has incorrect ISBN13")

conn.close()
