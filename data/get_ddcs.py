import re
import requests
import sqlite3

conn = sqlite3.connect("catalogue.sqlite.db")
cursor = conn.cursor()

cursor.execute("SELECT ISBN13 FROM Books")
isbns = [i[0] for i in cursor.fetchall()]

for isbn in isbns:
	print("-------------------------------------------------")
	response_text = requests.post(f"http://classify.oclc.org/classify2/Classify?isbn={isbn}&summary=true").text
	found = re.search("\ssfa=\"(?P<ddc>\d\d\d(\.\d*)?)\"", response_text)
	if found:
		cmd = f"UPDATE Books SET DDC='{found.group('ddc')}' WHERE ISBN13={isbn}"
		print(cmd)
		cursor.execute(cmd)
	else:
		wi = re.search("\swi=\"(?P<wi>\d*)\"", response_text)
		if wi:
			real_response_text = requests.post(f"http://classify.oclc.org/classify2/Classify?wi={wi.group('wi')}&summary=true").text
			sfa = re.search("\ssfa=\"(?P<ddc>\d\d\d(\.\d*)?)\"", real_response_text)
			if sfa:
				cmd = f"UPDATE Books SET DDC=\'{sfa.group('ddc')}\' WHERE ISBN13={isbn}"
				print(cmd)
				cursor.execute(cmd)
	print("-------------------------------------------------")

conn.commit()
conn.close()
